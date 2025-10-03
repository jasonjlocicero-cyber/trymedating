// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock with:
 * - Typing indicator via Supabase Realtime broadcast channel (no DB needed)
 * - Send status (sending/failed retry)
 * - Auto-mark as read for incoming messages in open thread
 * - Enter to send, Shift+Enter for newline, Esc to close
 */

export default function ChatDock({
  me,
  partnerId,
  partnerName = '',
  onClose,
  onUnreadChange = () => {}
}) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [peerTyping, setPeerTyping] = useState(false)

  const listRef = useRef(null)
  const inputRef = useRef(null)
  const typingTimerRef = useRef(null)
  const threadKey = useMemo(() => {
    // deterministic thread key independent of who starts it
    const a = String(me.id)
    const b = String(partnerId)
    return a < b ? `${a}-${b}` : `${b}-${a}`
  }, [me.id, partnerId])

  // ---- Load messages for this thread ----
  useEffect(() => {
    let cancel = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender, receiver, body, created_at, read_at')
        .or(
          `and(sender.eq.${me.id},receiver.eq.${partnerId}),and(sender.eq.${partnerId},receiver.eq.${me.id})`
        )
        .order('created_at', { ascending: true })
      if (!cancel) {
        setMessages(error ? [] : data || [])
        setLoading(false)
        // mark incoming as read
        markThreadRead()
      }
    }
    load()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, partnerId])

  // ---- Realtime inserts/updates for this thread ----
  useEffect(() => {
    const ch = supabase
      .channel(`msg-${me.id}-${partnerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          const m = payload.new
          const isCurrent =
            (m.sender === me.id && m.receiver === partnerId) ||
            (m.sender === partnerId && m.receiver === me.id)
          if (!isCurrent) return
          setMessages(prev => [...prev, m])
          // if it's incoming to me, mark as read
          if (m.receiver === me.id && !m.read_at) {
            markThreadRead()
          }
          // let parent recompute unread
          onUnreadChange && onUnreadChange()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => onUnreadChange && onUnreadChange()
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, partnerId])

  // ---- Typing indicator via Realtime broadcast ----
  useEffect(() => {
    const typingChannel = supabase.channel(`typing:${threadKey}`)

    typingChannel
      .on('broadcast', { event: 'typing' }, payload => {
        const from = payload?.payload?.from
        // Only show if partner is typing (not me)
        if (from && from !== me.id) {
          setPeerTyping(true)
          // hide after 2.5s if no more typing pings
          window.clearTimeout(typingTimerRef.current)
          typingTimerRef.current = window.setTimeout(() => setPeerTyping(false), 2500)
        }
      })
      .subscribe()

    return () => {
      window.clearTimeout(typingTimerRef.current)
      supabase.removeChannel(typingChannel)
    }
  }, [threadKey, me.id])

  // helper to ping typing
  function broadcastTyping() {
    // small throttle via timeout on keypress below
    supabase.channel(`typing:${threadKey}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { from: me.id, at: Date.now() }
    })
  }

  // ---- Auto-scroll ----
  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length, peerTyping])

  // ---- Send message with optimistic UI ----
  async function send(e) {
    e?.preventDefault?.()
    const body = text.trim()
    if (!body) return

    // optimistic local row
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic = {
      id: tempId,
      sender: me.id,
      receiver: partnerId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      _status: 'sending'
    }
    setMessages(prev => [...prev, optimistic])
    setText('')

    const { data, error } = await supabase.from('messages').insert({
      sender: me.id,
      receiver: partnerId,
      body
    }).select('id, sender, receiver, body, created_at, read_at').single()

    if (error || !data) {
      // mark failed
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed' } : m))
    } else {
      // replace temp with server row
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...data } : m)
      )
    }
  }

  // retry for failed optimistic messages
  async function retrySend(failedMsg) {
    setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, _status: 'sending' } : m))
    const { data, error } = await supabase.from('messages').insert({
      sender: me.id,
      receiver: partnerId,
      body: failedMsg.body
    }).select('id, sender, receiver, body, created_at, read_at').single()
    if (error || !data) {
      setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, _status: 'failed' } : m))
    } else {
      setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...data } : m))
    }
  }

  // mark all incoming (partner -> me) as read
  async function markThreadRead() {
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .eq('receiver', me.id)
      .eq('sender', partnerId)
    onUnreadChange && onUnreadChange()
  }

  // key handling: Enter to send, Shift+Enter newline, Esc close
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose && onClose()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
      return
    }
  }

  function onInputChange(e) {
    setText(e.target.value)
    // very light throttle to avoid spamming channel
    if (!typingTimerRef.current) {
      broadcastTyping()
      typingTimerRef.current = window.setTimeout(() => {
        typingTimerRef.current = null
      }, 800)
    }
  }

  const title = useMemo(() => partnerName || 'Conversation', [partnerName])
  const canType = !!me?.id

  return (
    <div
      style={{
        position:'fixed', right:16, bottom:80,
        width: 360, maxWidth:'calc(100vw - 24px)',
        background:'#fff', border:'1px solid var(--border)', borderRadius:12,
        boxShadow:'0 12px 32px rgba(0,0,0,0.12)', zIndex: 1002,
        display:'flex', flexDirection:'column', overflow:'hidden'
      }}
    >
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ fontWeight:800 }}>{title}</div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-neutral" onClick={markThreadRead} title="Mark read">✓</button>
          <button className="btn btn-neutral" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      {/* list */}
      <div ref={listRef} style={{ padding:12, overflowY:'auto', maxHeight: 420 }}>
        {loading && <div className="muted">Loading…</div>}
        {!loading && messages.length === 0 && <div className="muted">Say hi 👋</div>}
        {messages.map(m => {
          const mine = m.sender === me.id
          const failed = m._status === 'failed'
          const sending = m._status === 'sending'
          return (
            <div key={m.id} style={{ display:'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom:8 }}>
              <div
                style={{
                  maxWidth:'78%', padding:'8px 10px', borderRadius: 12,
                  background: mine ? '#0f766e' : '#f8fafc',
                  color: mine ? '#fff' : '#0f172a',
                  border: mine ? 'none' : '1px solid var(--border)'
                }}
              >
                <div style={{ whiteSpace:'pre-wrap' }}>{m.body}</div>
                <div className="muted" style={{ fontSize:11, marginTop:4, display:'flex', gap:8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                  {mine && sending && <span>· sending…</span>}
                  {mine && failed && (
                    <>
                      <span style={{ color:'#ef4444' }}>· failed</span>
                      <button
                        type="button"
                        className="btn btn-neutral"
                        style={{ padding:'0 6px', fontSize:11 }}
                        onClick={() => retrySend(m)}
                      >
                        retry
                      </button>
                    </>
                  )}
                  {!mine && m.read_at && <span>· read</span>}
                </div>
              </div>
            </div>
          )
        })}

        {/* typing indicator */}
        {peerTyping && (
          <div style={{ marginTop:8, display:'flex', justifyContent:'flex-start' }}>
            <div
              style={{
                maxWidth:'60%', padding:'6px 10px', borderRadius:12,
                background:'#f1f5f9', border:'1px solid var(--border)', color:'#0f172a',
                fontSize:12
              }}
            >
              typing…
            </div>
          </div>
        )}
      </div>

      {/* composer */}
      <form onSubmit={send} style={{ display:'flex', gap:8, padding:12, borderTop:'1px solid var(--border)' }}>
        <textarea
          ref={inputRef}
          className="input"
          value={text}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          placeholder={canType ? 'Type a message…' : 'Sign in to message'}
          style={{ flex:1, resize:'none', minHeight:42, maxHeight:120 }}
          disabled={!canType}
        />
        <button className="btn btn-primary" type="submit" disabled={!canType || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}











