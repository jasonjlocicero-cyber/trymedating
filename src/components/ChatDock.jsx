// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock
 * - Floating launcher opens a dock.
 * - If no chats are open, we now show an EMPTY STATE card with guidance + Close button.
 * - Only allows sending when connected and not blocked (server RLS also enforces).
 * - Exposes window.trymeChat.open({ handle }) for deep links from elsewhere.
 */

export default function ChatDock() {
  const [me, setMe] = useState(null)
  const [windows, setWindows] = useState([]) // [{key,userId,handle,display_name,avatar_url,messages,input,canSend,banner}]
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

  // Public API for opening a conversation by handle
  useEffect(() => {
    window.trymeChat = {
      open: async ({ handle }) => {
        if (!handle) return
        setOpen(true)

        // Resolve partner
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

    // 1) check connection
    const { data: conns } = await supabase
      .from('connections')
      .select('user_1, user_2')
      .or(`user_1.eq.${me.id},user_2.eq.${me.id}`)
    const connected = (conns || []).some(
      r => (r.user_1 === me.id && r.user_2 === partnerId) || (r.user_2 === me.id && r.user_1 === partnerId)
    )

    // 2) check if I blocked them (RLS lets me see my own blocks)
    const { data: myBlocks } = await supabase
      .from('blocks')
      .select('blocker, blocked')
      .eq('blocker', me.id)
    const iBlockedThem = (myBlocks || []).some(b => b.blocked === partnerId)

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
    if (!w.canSend) return

    const text = (w.input || '').trim()
    if (!text) return

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

    const { error } = await supabase
      .from('messages')
      .insert({ sender: me.id, recipient: partnerId, body: text })

    if (error) {
      // remove temp + show banner
      setWindows(wins => wins.map(x => {
        if (x.userId !== partnerId) return x
        const msgs = x.messages.filter(m => m !== temp)
        return {
          ...x,
          messages: msgs,
          canSend: false,
          banner: { tone: 'danger', text: 'Message blocked. You may be blocked or not connected.' }
        }
      }))
    } else {
      loadHistory(partnerId)
    }
  }

  function closeWindow(partnerId) {
    setWindows(wins => wins.filter(w => w.userId !== partnerId))
  }

  // styles
  const dockStyle = useMemo(() => ({
    position: 'fixed',
    right: 16,
    bottom: 16 + 56, // leave room for launcher/close fab
    zIndex: 40,
    display: open ? 'grid' : 'none',
    gap: 12
  }), [open])

  return (
    <>
      {/* Launcher / Close FAB */}
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', right: 16, bottom: 16, zIndex: 41,
            background: 'linear-gradient(135deg, var(--secondary), var(--primary))',
            color: '#fff', border: 'none', borderRadius: 9999, padding: '12px 16px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.2)', fontWeight: 800, cursor: 'pointer'
          }}
          aria-label="Open messages"
        >
          Messages
        </button>
      ) : (
        <button
          onClick={() => { setOpen(false) }}
          style={{
            position: 'fixed', right: 16, bottom: 16, zIndex: 41,
            background: '#111827', color: '#fff',
            border: 'none', borderRadius: 9999, padding: '10px 14px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.2)', fontWeight: 700, cursor: 'pointer'
          }}
          aria-label="Close messages"
          title="Close"
        >
          Close
        </button>
      )}

      <div style={dockStyle}>
        {/* EMPTY STATE when dock is open but no chats yet */}
        {open && windows.length === 0 && (
          <div className="card" style={{ width: 320 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Messages</div>
            {!me ? (
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                Please <Link to="/auth">sign in</Link> to start chatting.
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                No conversations yet. Open a profile from your <Link to="/network">Network</Link> to start a chat.
              </div>
            )}
          </div>
        )}

        {/* Open chat windows */}
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






