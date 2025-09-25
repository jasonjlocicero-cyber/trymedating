// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock
 * Floating chat window(s) with guardrails:
 * - Only allow sending if users are connected and not blocked (either way).
 * - Shows clear banners explaining why sending is disabled.
 *
 * Exposes: window.trymeChat.open({ handle })
 */

export default function ChatDock() {
  const [me, setMe] = useState(null)
  const [windows, setWindows] = useState([]) // [{handle, userId, messages:[], input:'', canSend:true, banner:null}]
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

  // API: window.trymeChat.open({ handle })
  useEffect(() => {
    window.trymeChat = {
      open: async ({ handle }) => {
        if (!handle) return
        setOpen(true)

        // Resolve partner by handle
        const { data: prof, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url')
          .eq('handle', handle.toLowerCase())
          .maybeSingle()
        if (pErr || !prof?.user_id) {
          alert('User not found'); return
        }

        // Prepare window model
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
        }

        setWindows(wins => {
          // de-duplicate by userId
          if (wins.some(w => w.userId === next.userId)) return wins
          return [next, ...wins].slice(0, 4) // keep up to 4 windows
        })

        // Load perms + history
        await refreshWindowPerms(prof.user_id)
        await loadHistory(prof.user_id)
      },
      // optional: expose close-by-handle
      close: ({ handle }) => {
        setWindows(wins => wins.filter(w => w.handle !== handle))
      }
    }
    return () => { delete window.trymeChat }
  }, [me])

  async function refreshWindowPerms(partnerId) {
    if (!me?.id || !partnerId) return

    // 1) Are we connected?
    const { data: conns } = await supabase
      .from('connections')
      .select('user_1, user_2')
      .or(`user_1.eq.${me.id},user_2.eq.${me.id}`)

    const connected = (conns || []).some(
      r => (r.user_1 === me.id && r.user_2 === partnerId) || (r.user_2 === me.id && r.user_1 === partnerId)
    )

    // 2) Is there any block either direction?
    const { data: blocks } = await supabase
      .from('blocks')
      .select('blocker, blocked')
      .or(`blocker.eq.${me.id},blocker.eq.${partnerId}`) // fetch both user's block lists (RLS shows only my blocks; that's fine)
      // Note: due to RLS we only see my own "blocker" rows. That's enough to warn "You blocked this user".
      // Server-side policy already prevents sends if either party blocked, so we still show a generic send failure banner if needed.

    // Determine local flags
    const iBlockedThem = (blocks || []).some(b => b.blocked === partnerId && b.blocker === me.id)
    // We cannot see if THEY blocked US via select (RLS), but the server will reject sends;
    // So we proactively warn if not connected; for block-by-them we catch error on send and set banner.

    setWindows(wins => wins.map(w => {
      if (w.userId !== partnerId) return w
      if (iBlockedThem) {
        return {
          ...w,
          canSend: false,
          banner: { tone: 'danger', text: 'You have blocked this user. Unblock them from your Network to resume chatting.' }
        }
      }
      if (!connected) {
        return {
          ...w,
          canSend: false,
          banner: { tone: 'info', text: 'You are not connected. Ask them to scan your QR to connect before chatting.' }
        }
      }
      return { ...w, canSend: true, banner: null }
    }))
  }

  async function loadHistory(partnerId) {
    if (!me?.id || !partnerId) return
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, recipient, body, created_at')
      .or(`and(sender.eq.${me.id},recipient.eq.${partnerId}),and(sender.eq.${partnerId},recipient.eq.${me.id})`)
      .order('created_at', { ascending: true })
    if (error) return
    setWindows(wins => wins.map(w => w.userId === partnerId ? { ...w, messages: data || [] } : w))
  }

  async function sendMessage(partnerId) {
    if (!me?.id) { alert('Please sign in.'); return }
    const w = windows.find(x => x.userId === partnerId)
    if (!w) return
    if (!w.canSend) return // guarded by UI

    const text = (w.input || '').trim()
    if (!text) return
    // optimistic add
    const temp = {
      id: `temp_${Date.now()}`,
      sender: me.id,
      recipient: partnerId,
      body: text,
      created_at: new Date().toISOString()
    }
    setWindows(wins => wins.map(x => x.userId === partnerId
      ? { ...x, input: '', messages: [...x.messages, temp] }
      : x
    ))

    // server insert (will fail if blocked by them; RLS denies insert)
    const { error } = await supabase
      .from('messages')
      .insert({ sender: me.id, recipient: partnerId, body: text })

    if (error) {
      // Roll back optimistic append and show banner
      setWindows(wins => wins.map(x => {
        if (x.userId !== partnerId) return x
        const msgs = x.messages.filter(m => m !== temp) // remove temp
        let banner = x.banner
        // If server says permission denied -> likely blocked by them (or not connected, but we check that earlier)
        banner = { tone: 'danger', text: 'Message blocked. You may be blocked or not connected.' }
        return { ...x, messages: msgs, canSend: false, banner }
      }))
    } else {
      // success: reload to get real row (optional)
      loadHistory(partnerId)
    }
  }

  function closeWindow(partnerId) {
    setWindows(wins => wins.filter(w => w.userId !== partnerId))
    if (windows.length <= 1) setOpen(false)
  }

  // Basic styles
  const dockStyle = useMemo(() => ({
    position: 'fixed',
    right: 16,
    bottom: 16,
    zIndex: 40,
    display: open ? 'grid' : 'none',
    gap: 12
  }), [open])

  return (
    <>
      {/* Minimal launcher (kept simple; elsewhere you may show a badge) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', right: 16, bottom: 16, zIndex: 30,
            background: 'linear-gradient(135deg, var(--secondary), var(--primary))',
            color: '#fff', border: 'none', borderRadius: 9999, padding: '12px 16px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.2)', fontWeight: 800, cursor: 'pointer'
          }}
          aria-label="Open messages"
        >
          Messages
        </button>
      )}

      <div style={dockStyle}>
        {windows.map(w => (
          <div key={w.key} className="card" style={{ width: 320, padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderBottom: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img
                  src={w.avatar_url || 'https://via.placeholder.com/28?text=%F0%9F%91%A4'}
                  alt=""
                  style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
                />
                <div style={{ fontWeight: 700 }}>{w.display_name}</div>
              </div>
              <button className="btn" onClick={() => closeWindow(w.userId)}>×</button>
            </div>

            {/* Banner */}
            {w.banner && (
              <div style={{
                padding: '8px 12px',
                fontSize: 12,
                color: w.banner.tone === 'danger' ? '#b91c1c' : '#374151',
                background: w.banner.tone === 'danger'
                  ? 'color-mix(in oklab, #fee2e2, white 50%)'
                  : 'color-mix(in oklab, var(--bg-soft), white 40%)',
                borderBottom: '1px solid var(--border)'
              }}>
                {w.banner.text}
              </div>
            )}

            {/* Messages */}
            <div style={{ maxHeight: 260, overflowY: 'auto', padding: 12, display: 'grid', gap: 8 }}>
              {w.messages.map(m => {
                const mine = m.sender === me?.id
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      background: mine ? 'var(--primary)' : '#f3f4f6',
                      color: mine ? '#fff' : '#111827',
                      borderRadius: 12,
                      padding: '8px 10px',
                      maxWidth: 220,
                      wordBreak: 'break-word'
                    }}>
                      {m.body}
                    </div>
                  </div>
                )
              })}
              {w.messages.length === 0 && (
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>No messages yet.</div>
              )}
            </div>

            {/* Composer */}
            <div style={{ borderTop: '1px solid var(--border)', padding: 8 }}>
              <form onSubmit={(e)=>{ e.preventDefault(); sendMessage(w.userId) }} style={{ display: 'flex', gap: 6 }}>
                <input
                  value={w.input}
                  onChange={e => setWindows(ws => ws.map(x => x.userId === w.userId ? { ...x, input: e.target.value } : x))}
                  placeholder={w.canSend ? 'Type a message…' : 'Messaging disabled'}
                  disabled={!w.canSend}
                />
                <button className="btn btn-primary" type="submit" disabled={!w.canSend}>Send</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}





