// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ChatDock({ me, partnerId, partnerName = '', onClose, onUnreadChange = () => {} }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const listRef = useRef(null)

  // load initial
  useEffect(() => {
    let cancel = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender, receiver, body, created_at, read_at')
        .or(`and(sender.eq.${me.id},receiver.eq.${partnerId}),and(sender.eq.${partnerId},receiver.eq.${me.id})`)
        .order('created_at', { ascending: true })
      if (!cancel) {
        if (error) {
          setMessages([])
        } else {
          setMessages(data || [])
        }
        setLoading(false)
        // mark unread from partner as read
        markThreadRead()
      }
    }
    load()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, partnerId])

  // realtime
  useEffect(() => {
    const ch = supabase.channel(`msg-${me.id}-${partnerId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new
          const isCurrentThread =
            (m.sender === me.id && m.receiver === partnerId) ||
            (m.sender === partnerId && m.receiver === me.id)
          if (isCurrentThread) {
            setMessages((prev) => [...prev, m])
            // Auto-mark as read if it's to me
            if (m.receiver === me.id && !m.read_at) {
              markThreadRead()
            }
          }
          // ask parent to recalc unread globally
          onUnreadChange && onUnreadChange()
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => onUnreadChange && onUnreadChange()
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, partnerId])

  // autoscroll
  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length])

  async function send(e) {
    e?.preventDefault?.()
    const body = text.trim()
    if (!body) return
    setText('')
    const { error } = await supabase.from('messages').insert({
      sender: me.id,
      receiver: partnerId,
      body
    })
    if (error) {
      // put text back on failure
      setText(body)
    }
  }

  async function markThreadRead() {
    // mark all incoming from partner to me as read
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .eq('receiver', me.id)
      .eq('sender', partnerId)
    onUnreadChange && onUnreadChange()
  }

  const title = useMemo(() => partnerName || 'Conversation', [partnerName])

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
                <div className="muted" style={{ fontSize:11, marginTop:4, textAlign: mine ? 'right' : 'left' }}>
                  {new Date(m.created_at).toLocaleString()}
                  {!mine && m.read_at && ' · read'}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* composer */}
      <form onSubmit={send} style={{ display:'flex', gap:8, padding:12, borderTop:'1px solid var(--border)' }}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          style={{ flex:1 }}
        />
        <button className="btn btn-primary" type="submit">Send</button>
      </form>
    </div>
  )
}









