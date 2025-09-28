// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Props expected (adjust if your names differ):
 * - me: { id, email, handle? }
 * - convoId: string
 * - peer: { id, handle? }
 * - open: boolean
 * - onClose: () => void
 */
export default function ChatDock({ me, convoId, peer, open, onClose }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  // Typing indicator
  const [typingFrom, setTypingFrom] = useState(null)
  const typingClearTimer = useRef(null)
  const lastTypingSentAt = useRef(0)

  // Delivery/read
  const [deliveredMap, setDeliveredMap] = useState({})

  // Reply & UI state
  const [replyToId, setReplyToId] = useState(null)
  const [hoverMsgId, setHoverMsgId] = useState(null)
  const [reactPickerFor, setReactPickerFor] = useState(null)

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
        .select('id, convo_id, sender_id, body, created_at, read_at, parent_id, reactions')
        .eq('convo_id', convoId)
        .order('created_at', { ascending: true })
      if (!canceled) {
        if (error) {
          console.error('load messages error', error)
        } else {
          setMessages(data || [])
          setTimeout(() => listRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' }), 50)
          markAllIncomingRead()
        }
      }
    })()
    return () => { canceled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, me?.id, convoId])

  // ========= Realtime INSERT + UPDATE (read_at / reactions / parent) =========
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

          // If this INSERT is from the other user -> delivered ack + mark read
          if (m.sender_id !== me?.id) {
            broadcastDelivered(m.id)
            markIncomingRead([m.id])
          }
        }
      )
      // Updates: read_at / reactions etc
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `convo_id=eq.${convoId}` },
        (payload) => {
          const updated = payload.new
          setMessages(prev =>
            prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m))
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

  // ========= Read receipts =========
  async function markIncomingRead(ids) {
    try {
      if (!ids || ids.length === 0) return
      const { error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids)
        .neq('sender_id', me.id)
        .is('read_at', null)
      if (error) console.error('markIncomingRead error', error)
    } catch (e) { console.error('markIncomingRead exception', e) }
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
    } catch (e) { console.error('markAllIncomingRead exception', e) }
  }

  useEffect(() => {
    if (!open) return
    const onFocus = () => markAllIncomingRead()
    window.addEventListener('focus', onFocus)
    const t = setInterval(markAllIncomingRead, 3000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messages, me?.id])

  // ========= Send message (with optional parent_id) =========
  async function handleSend(e) {
    e?.preventDefault?.()
    if (!canSend) return
    setSending(true)
    const body = text.trim()
    try {
      const insertPayload = { convo_id: convoId, sender_id: me.id, body }
      if (replyToId) insertPayload.parent_id = replyToId

      const { error } = await supabase
        .from('messages')
        .insert(insertPayload)

      if (error) throw error
      setText('')
      setReplyToId(null)
      inputRef.current?.focus()
    } catch (err) {
      console.error('send error', err)
      alert('Could not send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  // ========= Reactions =========
  const EMOJIS = ['👍','❤️','😂','😮','🙌']

  async function toggleReaction(messageId, emoji) {
    try {
      const msg = messages.find(m => m.id === messageId)
      if (!msg) return
      const current = msg.reactions || {}
      // current shape: { "👍": ["user1","user2"], "❤️": ["user3"] }
      const arr = Array.isArray(current[emoji]) ? [...current[emoji]] : []
      const idx = arr.indexOf(me.id)
      if (idx >= 0) arr.splice(idx, 1); else arr.push(me.id)
      const next = { ...current, [emoji]: arr }

      const { error } = await supabase
        .from('messages')
        .update({ reactions: next })
        .eq('id', messageId)
        .eq('convo_id', convoId)

      if (error) throw error
      // optimistic update (realtime UPDATE will also arrive)
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions: next } : m))
    } catch (e) {
      console.error('toggleReaction error', e)
    } finally {
      setReactPickerFor(null)
    }
  }

  function totalReacts(reactions) {
    if (!reactions || typeof reactions !== 'object') return 0
    return Object.values(reactions).reduce((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0)
  }

  // ========= Keyboard: Enter=send, Shift+Enter=newline =========
  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ========= Helpers =========
  function computeStatus(m, mine) {
    if (!mine) return { icon: null, read: false }
    if (m.read_at) return { icon: '✓✓', read: true }
    if (deliveredMap[m.id]) return { icon: '✓✓', read: false }
    return { icon: '✓', read: false }
  }

  function sendTypingMaybe() {
    sendTyping()
  }

  function scrollToMessage(id) {
    const el = document.getElementById(`msg-${id}`)
    if (el && listRef.current) {
      const container = listRef.current
      const top = el.offsetTop - 12
      container.scrollTo({ top, behavior: 'smooth' })
      el.animate([{ transform:'scale(1)', background:'#fff' }, { transform:'scale(1.02)', background:'#fffbe6' }, { transform:'scale(1)', background:'#fff' }], { duration: 900 })
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
            const status = computeStatus(m, mine)
            const reactsCount = totalReacts(m.reactions)
            const parent = m.parent_id ? messages.find(x => x.id === m.parent_id) : null

            return (
              <div
                key={m.id}
                id={`msg-${m.id}`}
                style={{ display:'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}
                onMouseEnter={() => setHoverMsgId(m.id)}
                onMouseLeave={() => { if (reactPickerFor !== m.id) setHoverMsgId(null) }}
              >
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
                  {/* Reply preview */}
                  {parent && (
                    <button
                      type="button"
                      onClick={() => scrollToMessage(parent.id)}
                      title="Go to quoted message"
                      style={{
                        display:'block',
                        width:'100%',
                        textAlign:'left',
                        marginBottom:6,
                        padding:'6px 8px',
                        borderRadius:8,
                        border: mine ? '1px solid rgba(255,255,255,0.35)' : '1px solid var(--border)',
                        background: mine ? 'rgba(255,255,255,0.15)' : '#fafafa',
                        color: mine ? 'rgba(255,255,255,0.92)' : '#374151',
                        cursor:'pointer'
                      }}
                    >
                      <span style={{ fontWeight:700, marginRight:6, fontSize:12 }}>Replying to</span>
                      <span style={{ fontSize:12, opacity:0.9 }}>
                        {parent.body.length > 80 ? parent.body.slice(0,80)+'…' : parent.body}
                      </span>
                    </button>
                  )}

                  {/* Message body */}
                  {m.body}

                  {/* Status (my messages) */}
                  {mine && (
                    <span style={{
                      position:'absolute', right: 8, bottom: -16, fontSize: 12,
                      color: status.read ? 'var(--primary)' : '#9ca3af'
                    }}>
                      {status.icon}
                    </span>
                  )}

                  {/* Reactions row */}
                  {reactsCount > 0 && (
                    <div style={{
                      display:'flex', gap:6, marginTop:6, flexWrap:'wrap'
                    }}>
                      {Object.entries(m.reactions || {}).map(([emoji, arr]) => {
                        const count = Array.isArray(arr) ? arr.length : 0
                        if (!count) return null
                        const mineReacted = Array.isArray(arr) && arr.includes(me.id)
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => toggleReaction(m.id, emoji)}
                            title={mineReacted ? 'Remove reaction' : 'Add reaction'}
                            style={{
                              display:'inline-flex',
                              alignItems:'center',
                              gap:6,
                              padding:'2px 6px',
                              borderRadius:999,
                              border: '1px solid var(--border)',
                              background: mineReacted ? 'color-mix(in oklab, var(--secondary), #ffffff 80%)' : '#fff',
                              color:'#111',
                              fontSize:13,
                              lineHeight:1
                            }}
                          >
                            <span>{emoji}</span>
                            <span style={{ fontWeight:700 }}>{count}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Hover actions: Reply / React */}
                  {(hoverMsgId === m.id || reactPickerFor === m.id) && (
                    <div style={{
                      position:'absolute',
                      top:-26,
                      right: mine ? 6 : 'auto',
                      left: mine ? 'auto' : 6,
                      display:'flex',
                      gap:6
                    }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setReplyToId(m.id)}
                        title="Reply"
                        style={{ padding:'2px 8px', height:22 }}
                      >
                        ↩ Reply
                      </button>
                      <div style={{ position:'relative' }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setReactPickerFor(prev => prev === m.id ? null : m.id)}
                          title="React"
                          style={{ padding:'2px 8px', height:22 }}
                        >
                          🙂
                        </button>

                        {reactPickerFor === m.id && (
                          <div
                            onMouseLeave={() => { setReactPickerFor(null); setHoverMsgId(null) }}
                            style={{
                              position:'absolute',
                              top:-42, left:0,
                              background:'#fff',
                              border:'1px solid var(--border)',
                              borderRadius:12,
                              padding:'6px 8px',
                              boxShadow:'0 10px 24px rgba(0,0,0,0.12)',
                              display:'flex',
                              gap:6,
                              zIndex:10
                            }}
                          >
                            {EMOJIS.map(e => (
                              <button
                                key={e}
                                type="button"
                                onClick={() => toggleReaction(m.id, e)}
                                style={{
                                  fontSize:18,
                                  background:'transparent',
                                  border:'none',
                                  cursor:'pointer'
                                }}
                                title={`React ${e}`}
                              >
                                {e}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
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

        {/* Reply composer banner */}
        {replyToId && (
          <div style={{
            borderTop:'1px dashed var(--border)',
            padding:'6px 10px',
            background:'#fafafa',
            fontSize: 13,
            display:'flex',
            alignItems:'center',
            justifyContent:'space-between',
            gap:10
          }}>
            <span>Replying to a message</span>
            <button className="btn" type="button" onClick={() => setReplyToId(null)} style={{ padding:'2px 8px', height:24 }}>
              Cancel
            </button>
          </div>
        )}

        {/* Composer */}
        <form onSubmit={handleSend} style={composer}>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => { setText(e.target.value); sendTypingMaybe() }}
            onKeyDown={onKeyDown}
            placeholder={replyToId ? 'Write a reply…' : 'Type a message…'}
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
  gridTemplateRows:'auto 1fr auto auto'
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








