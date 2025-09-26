// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock
 * - Floating launcher opens a dock.
 * - Empty state when open with no chats.
 * - Guardrails: only send if connected and not blocked (server RLS also enforces).
 * - Report User: inline form (submit_report RPC).
 * - Unblock button if you blocked them.
 * - Rate limit: 2s cooldown.
 * - NEW: Messages limited to 500 chars, Shift+Enter = newline.
 */

export default function ChatDock() {
  const [me, setMe] = useState(null)
  const [windows, setWindows] = useState([])
  const [open, setOpen] = useState(false)

  // auth
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (mounted) setMe(user || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setMe(session?.user || null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Public API
  useEffect(() => {
    window.trymeChat = {
      open: async ({ handle }) => {
        if (!handle) return
        setOpen(true)

        const { data: prof, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url')
          .eq('handle', handle.toLowerCase())
          .maybeSingle()
        if (pErr || !prof?.user_id) { alert('User not found'); return }

        const next = {
          key: `u:${prof.user_id}`,
          userId: prof.user_id,
          handle: prof.handle,
          display_name: prof.display_name || prof.handle,
          avatar_url: prof.avatar_url || '',
          messages: [],
          input: '',
          canSend: false,
          banner: { tone: 'info', text: 'Checking permissions…' },
          iBlockedThem: false,
          lastSentAt: 0,
          cooldownMs: 2000,
          reportOpen: false,
          reportReason: '',
          reportContext: 'chat',
          reportBusy: false,
          reportNotice: '',
          reportError: ''
        }

        setWindows(wins => {
          if (wins.some(w => w.userId === next.userId)) return wins
          return [next, ...wins].slice(0, 4)
        })

        await refreshWindowPerms(prof.user_id)
        await loadHistory(prof.user_id)
      },
      closeAll: () => { setWindows([]); setOpen(false) }
    }
    return () => { delete window.trymeChat }
  }, [me])

  async function refreshWindowPerms(partnerId) {
    if (!me?.id || !partnerId) return
    const { data: conns } = await supabase
      .from('connections')
      .select('user_1, user_2')
      .or(`user_1.eq.${me.id},user_2.eq.${me.id}`)
    const connected = (conns || []).some(
      r => (r.user_1 === me.id && r.user_2 === partnerId) || (r.user_2 === me.id && r.user_1 === partnerId)
    )

    const { data: myBlocks } = await supabase
      .from('blocks')
      .select('blocked')
      .eq('blocker', me.id)
    const iBlockedThem = (myBlocks || []).some(b => b.blocked === partnerId)

    setWindows(wins => wins.map(w => {
      if (w.userId !== partnerId) return w
      if (iBlockedThem) return { ...w, iBlockedThem: true, canSend: false, banner: { tone: 'danger', text: 'You have blocked this user.' } }
      if (!connected) return { ...w, iBlockedThem: false, canSend: false, banner: { tone: 'info', text: 'You are not connected. Ask them to scan your QR first.' } }
      return { ...w, iBlockedThem: false, canSend: true, banner: null }
    }))
  }

  async function loadHistory(partnerId) {
    if (!me?.id || !partnerId) return
    const { data } = await supabase
      .from('messages')
      .select('id, sender, recipient, body, created_at')
      .or(`and(sender.eq.${me.id},recipient.eq.${partnerId}),and(sender.eq.${partnerId},recipient.eq.${me.id})`)
      .order('created_at', { ascending: true })
    setWindows(wins => wins.map(w => w.userId === partnerId ? { ...w, messages: data || [] } : w))
  }

  async function sendMessage(partnerId) {
    if (!me?.id) { alert('Please sign in.'); return }
    const w = windows.find(x => x.userId === partnerId)
    if (!w || !w.canSend) return

    const text = (w.input || '').trim()
    if (!text) return
    if (text.length > 500) {
      setWindows(ws => ws.map(x => x.userId === partnerId ? { ...x, banner: { tone: 'danger', text: 'Message too long (max 500 chars).' } } : x))
      return
    }

    const now = Date.now()
    const elapsed = now - (w.lastSentAt || 0)
    if (elapsed < w.cooldownMs) {
      const waitLeft = Math.ceil((w.cooldownMs - elapsed) / 1000)
      setWindows(ws => ws.map(x => x.userId === partnerId ? { ...x, banner: { tone: 'info', text: `Please wait ${waitLeft}s…` } } : x))
      return
    }

    const temp = { id: `temp_${now}`, sender: me.id, recipient: partnerId, body: text, created_at: new Date().toISOString() }
    setWindows(wins => wins.map(x => x.userId === partnerId ? { ...x, input: '', messages: [...x.messages, temp], lastSentAt: now } : x))

    const { error } = await supabase.from('messages').insert({ sender: me.id, recipient: partnerId, body: text })
    if (error) {
      setWindows(wins => wins.map(x => x.userId === partnerId ? { ...x, messages: x.messages.filter(m => m.id !== temp.id), banner: { tone: 'danger', text: 'Message blocked.' }, canSend: false } : x))
    } else {
      loadHistory(partnerId)
    }
  }

  function closeWindow(id) { setWindows(wins => wins.filter(w => w.userId !== id)) }

  // report + unblock unchanged (keep from your last version) …

  // style
  const dockStyle = useMemo(() => ({ position: 'fixed', right: 16, bottom: 72, zIndex: 40, display: open ? 'grid' : 'none', gap: 12 }), [open])

  return (
    <>
      {/* Launcher */}
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 41, background: 'linear-gradient(135deg, var(--secondary), var(--primary))', color: '#fff', border: 'none', borderRadius: 9999, padding: '12px 16px', boxShadow: '0 6px 20px rgba(0,0,0,0.2)', fontWeight: 800 }}>Messages</button>
      ) : (
        <button onClick={() => setOpen(false)} style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 41, background: '#111827', color: '#fff', border: 'none', borderRadius: 9999, padding: '10px 14px', boxShadow: '0 6px 20px rgba(0,0,0,0.2)', fontWeight: 700 }}>Close</button>
      )}

      <div style={dockStyle}>
        {open && windows.map(w => (
          <div key={w.key} className="card" style={{ width: 320, padding: 0, overflow: 'hidden' }}>
            {/* header + banner + messages (same as before) */}

            {/* Composer */}
            <div style={{ borderTop: '1px solid var(--border)', padding: 8 }}>
              <form onSubmit={e => { e.preventDefault(); sendMessage(w.userId) }} style={{ display: 'grid', gap: 6 }}>
                <textarea
                  rows={1}
                  maxLength={500}
                  value={w.input}
                  onChange={e => setWindows(ws => ws.map(x => x.userId === w.userId ? { ...x, input: e.target.value } : x))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage(w.userId)
                    }
                  }}
                  placeholder={w.canSend ? 'Type a message… (Shift+Enter = newline)' : 'Messaging disabled'}
                  disabled={!w.canSend}
                  style={{ resize: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {w.input.length > 450 && `${w.input.length}/500`}
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={!w.canSend}>Send</button>
                </div>
              </form>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}







