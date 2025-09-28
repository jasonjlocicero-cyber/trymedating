// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Props expected (same as before; adjust if your names differ):
 * - me: { id, email, handle? }
 * - convoId: string
 * - peer: { id, handle? } (optional, for header label)
 * - open: boolean
 * - onClose: () => void
 */
export default function ChatDock({ me, convoId, peer, open, onClose }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  // ---- Typing indicator ----
  const [typingFrom, setTypingFrom] = useState(null)
  const typingClearTimer = useRef(null)
  const lastTypingSentAt = useRef(0)

  // ---- Delivery map (local) ----
  // message_id -> true when recipient broadcasted "delivered"
  const [deliveredMap, setDeliveredMap] = useState({})

  const listRef = useRef(null)
  const inputRef = useRef(null)

  const canSend = useMemo(
    () => me?.id && convoId && text.trim().length > 0 && !sending,
    [me, convoId, text, sending]
  )

  // ========= Initial load =========
  useEffect(() => {
    if (!open || !me?.id || !convoId) return
    let canceled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, convo_id, sender_id, body, created_at, read_at')
        .eq('convo_id', convoId)
        .order('created_at', { ascending: true })
      if (!canceled) {
        if (error) {
          console.error('load messages error', error)
        } else {
          setMessages(data || [])
          // Scroll down
          setTimeout(() => listRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' }), 50)
          // When dock opens, mark any unread incoming as read
          markAllIncomingRead()
        }
      }
    })()
    return () => { canceled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, me?.id, convoId])

  // ========= Realtime INSERT + UPDATE (read_at) =========
  useEffect(() => {
    if (!open || !convoId) return
    const ch = supabase
      .channel(`msgs:${convoId}`)
      // New messages
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `convo_id=eq.${convoId}` },
        (payload) => {
          const m = payload.new
          setMessages(prev => [...prev, m])
          setTimeout(() => listRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' }), 10)

          // If this INSERT is from the other user -> send "delivered" ack
          if (m.sender_id !== me?.id) {
            broadcastDelivered(m.id)
            // Also mark read immediately if the dock is visible/focused
            // (We still batch markAllIncomingRead, but this is snappier for single-message)
            markIncomingRead([m.id])
          }
        }
      )
      // Read receipt updates
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `convo_id=eq.${convoId}` },
        (payload) => {
          const updated = payload.new
          setMessages(prev =>
            prev.map(m => (m.id === updated.id ? { ...m, read_at: updated.read_at } : m))
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, convoId, me?.id])

  // ========= Typing indicator (broadcast) =========
  useEffect(() => {
    if (!open || !convoId) return
    const channel = supabase.channel(`typing:${convoId}`, { config: { broadcast: { self: false } } })

    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const { user_id, handle } = payload?.payload || {}
      if (!user_id || user_id === me?.id) return
      setTypingFrom(handle || 'Someone')
      if (typingClearTimer.current) clearTimeout(typingClearTimer.current)
      typingClearTimer.current = setTimeout(() => setTypingFrom(null), 3000)
    })

    channel.subscribe()
    return () => {
      if (typingClearTimer.current) clearTimeout(typingClearTimer.current)
      supabase.removeChannel(channel)
    }
  }, [open, convoId, me?.id])

  function sendTyping() {
    const now = Date.now()
    if (now - lastTypingSentAt.current < 2000) return
    lastTypingSentAt.current = now
    supabase.channel(`typing:${convoId}`, { config: { broadcast: { self: false } } })
      .send({ type: 'broadcast', event: 'typing', payload: { user_id: me?.id, handle: me?.handle || me?.email || 'Someone' } })
      .catch(() => {})
  }

  // ========= Delivery acks (broadcast) =========
  useEffect(() => {
    if (!open || !convoId) return
    const ch = supabase.channel(`acks:${convoId}`, { config: { broadcast: { self: false } } })

    ch.on('broadcast', { event: 'delivered' }, (payload) => {
      const { message_id, from_user } = payload?.payload || {}
      if (!message_id) return
      // If the other party acknowledged delivery of my message
      // (ignore if it came from me)
      if (from_user && from_user === me?.id) return
      setDeliveredMap(prev => ({ ...prev, [message_id]: true }))
    })

    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [open, convoId, me?.id])

  function broadcastDelivered(messageId) {
    supabase.channel(`acks:${convoId}`, { config: { broadcast: { self: false } } })
      .send({ type: 'broadcast', event: 'delivered', payload: { message_id: messageId, from_user: me?.id } })
      .catch(() => {})
  }

  // ========= Mark read helpers =========
  async function markIncomingRead(ids) {
    try {
      if (!ids || ids.length === 0) return
      const { error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids)
        .neq('sender_id', me.id) // only mark messages from the other person
        .is('read_at', null)
      if (error) console.error('markIncomingRead error', error)
    } catch (e) {
      console.error('markIncomingRead exception', e)
    }
  }

  async function markAllIncomingRead() {
    try {
      const unread = (messages || []).filter(m => m.sender_id !== me?.id && !m.read_at).map(m => m.id)
      if (unread.length === 0) return
      const { error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unread)
        .neq('sender_id', me.id)
        .is('read_at', null)
      if (error) console.error('markAllIncomingRead error', error)
    } catch (e) {
      console.error('markAllIncomingRead exception', e)
    }
  }

  // Mark read when the dock gains focus (and periodically while open)
  useEffect(() => {
    if (!open) return
    const onFocus = () => markAllIncomingRead()
    window.addEventListener('focus', onFocus)
    const t = setInterval(markAllIncomingRead, 3000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messages, me?.id])

  // ========= Send message =========
  async function handleSend(e) {
    e?.preventDefault?.()
    if (!canSend) return
    setSending(true)
    const body = text.trim()
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({ convo_id: convoId, sender_id: me.id, body })
        .select('id')
        .single()
      if (error) throw error
      setText('')
      inputRef.current?.focus()
      // "Sent" is immediate; "delivered" will flip when the other side broadcasts
      // Optionally seed deliveredMap[data.id] = false (implicit by default)
    } catch (err) {
      console.error('send error', err)
      alert('Could not send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  // Keyboard: Enter = send, Shift+Enter = newline
  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ========= UI =========
  if (!open) return null

  return (
    <div style={wrap}>
      <div style={dock}>
        <div style={head}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <strong>Messages</strong>
            {peer?.handle && <span className="muted">@{peer.handle}</span>}
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div ref={listRef} style={list}>
          {messages.length === 0 && (
            <div className="muted" style={{ textAlign:'center', padding:'12px 0' }}>
              Say hi 👋
            </div>
          )}

          {messages.map(m => {
            const mine = m.sender_id === me?.id
            const status = computeStatus(m, mine, deliveredMap)
            return (
              <div key={m.id} style={{ display:'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '78%',
                  margin: '6px 8px',
                  padding: '8px 10px',
                  borderRadius: 12,
                  background: mine
                    ? 'linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)'
                    : '#fff',
                  color: mine ? '#fff' : '#111',
                  border: mine ? '1px solid transparent' : '1px solid var(--border)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  boxShadow: mine ? '0 2px 12px rgba(0,0,0,0.10)' : '0 1px 8px rgba(0,0,0,0.06)',
                  position:'relative'
                }}>
                  {m.body}
                  {mine && (
                    <span style={{
                      position:'absolute', right: 8, bottom: -16, fontSize: 12,
                      color: status.read ? 'var(--primary)' : '#9ca3af' // blue-ish when read
                    }}>
                      {status.icon}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {/* Typing indicator */}
          {typingFrom && (
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', color:'var(--muted)' }}>
              <TypingDots /> <span>{typingFrom} is typing…</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} style={composer}>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => { setText(e.target.value); sendTyping() }}
            onKeyDown={onKeyDown}
            placeholder="Type a message…"
            style={ta}
          />
          <button className="btn btn-primary" type="submit" disabled={!canSend}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

/* ======= Helpers ======= */
function computeStatus(m, mine, deliveredMap) {
  if (!mine) return { icon: null, read: false }
  if (m.read_at) return { icon: '✓✓', read: true }          // read
  if (deliveredMap[m.id]) return { icon: '✓✓', read: false } // delivered
  return { icon: '✓', read: false }                          // sent
}

/* ========== Tiny typing dots ========== */
function TypingDots() {
  return (
    <span style={{ display:'inline-flex', gap:3 }}>
      <Dot delay="0ms" /><Dot delay="120ms" /><Dot delay="240ms" />
      <style>{`
        @keyframes bump {
          0% { transform: translateY(0); opacity: 0.5 }
          50% { transform: translateY(-3px); opacity: 1 }
          100% { transform: translateY(0); opacity: 0.5 }
        }
      `}</style>
    </span>
  )
}
function Dot({ delay }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: 6, background: 'var(--muted)',
      display:'inline-block', animation: `bump 900ms ${delay} infinite`
    }} />
  )
}

/* ========== Styles ========== */
const wrap = {
  position:'fixed',
  right: 16,
  bottom: 16,
  zIndex: 50
}
const dock = {
  width: 360,
  maxHeight: '70vh',
  background:'#fff',
  border:'1px solid var(--border)',
  borderRadius: 14,
  overflow:'hidden',
  boxShadow:'0 12px 32px rgba(0,0,0,0.18)',
  display:'grid',
  gridTemplateRows:'auto 1fr auto'
}
const head = {
  display:'flex',
  alignItems:'center',
  justifyContent:'space-between',
  padding:'10px 12px',
  borderBottom:'1px solid var(--border)',
  background:'#fafafa'
}
const list = {
  overflowY:'auto',
  padding:'8px 4px'
}
const composer = {
  display:'flex',
  gap:8,
  padding:'10px',
  borderTop:'1px solid var(--border)',
  background:'#fff'
}
const ta = {
  flex:1,
  minHeight: 38,
  maxHeight: 120,
  resize:'vertical'
}








