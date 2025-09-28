// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Props expected (adjust if your names differ):
 * - me: { id, email, ... }          // current user
 * - convoId: string                 // conversation/thread id (stable)
 * - peer:   { id, handle, ... }     // other participant (optional, for header/label)
 * - open: boolean                   // whether the dock is visible
 * - onClose: () => void             // close handler
 */
export default function ChatDock({ me, convoId, peer, open, onClose }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  // Typing indicator state
  const [typingFrom, setTypingFrom] = useState(null) // { user_id, handle } or string
  const typingClearTimer = useRef(null)
  const lastTypingSentAt = useRef(0)

  const listRef = useRef(null)
  const inputRef = useRef(null)

  const canSend = useMemo(() => me?.id && convoId && text.trim().length > 0 && !sending, [me, convoId, text, sending])

  // ===== Load initial messages =====
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
          // scroll to bottom
          setTimeout(() => listRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }), 50)
        }
      }
    })()
    return () => { canceled = true }
  }, [open, me?.id, convoId])

  // ===== Realtime inserts for new messages =====
  useEffect(() => {
    if (!open || !convoId) return
    const ch = supabase
      .channel(`msgs:${convoId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `convo_id=eq.${convoId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new])
          setTimeout(() => listRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }), 10)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [open, convoId])

  // ===== Realtime typing indicator (broadcast) =====
  useEffect(() => {
    if (!open || !convoId) return
    const channel = supabase.channel(`typing:${convoId}`, {
      config: { broadcast: { self: false } }
    })

    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const { user_id, handle } = payload?.payload || {}
      if (!user_id || user_id === me?.id) return // ignore self
      // show indicator
      setTypingFrom(handle || 'Someone')
      // reset the 3s timeout
      if (typingClearTimer.current) clearTimeout(typingClearTimer.current)
      typingClearTimer.current = setTimeout(() => setTypingFrom(null), 3000)
    })

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        // console.log('typing channel subscribed')
      }
    })

    return () => {
      if (typingClearTimer.current) clearTimeout(typingClearTimer.current)
      supabase.removeChannel(channel)
    }
  }, [open, convoId, me?.id])

  // Send "typing" event (debounced to 2s)
  function sendTyping() {
    const now = Date.now()
    if (now - lastTypingSentAt.current < 2000) return
    lastTypingSentAt.current = now
    // fire-and-forget; no await needed
    supabase.channel(`typing:${convoId}`, { config: { broadcast: { self: false } } })
      .send({ type: 'broadcast', event: 'typing', payload: { user_id: me?.id, handle: me?.handle || me?.email || 'Someone' } })
      .catch(() => {})
  }

  // ===== Send message =====
  async function handleSend(e) {
    e?.preventDefault?.()
    if (!canSend) return
    setSending(true)
    const body = text.trim()
    try {
      const { error } = await supabase
        .from('messages')
        .insert({ convo_id: convoId, sender_id: me.id, body })
      if (error) throw error
      setText('')
      inputRef.current?.focus()
    } catch (err) {
      console.error('send error', err)
      alert('Could not send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  // ===== Keyboard: Enter=send, Shift+Enter=newline =====
  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ===== UI =====
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
                  boxShadow: mine ? '0 2px 12px rgba(0,0,0,0.10)' : '0 1px 8px rgba(0,0,0,0.06)'
                }}>
                  {m.body}
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







