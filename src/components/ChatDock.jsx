// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import ProfileHoverCard from './ProfileHoverCard'

export default function ChatDock({ me, convoId, peer, open, onClose }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const [typingFrom, setTypingFrom] = useState(null)
  const typingClearTimer = useRef(null)
  const lastTypingSentAt = useRef(0)

  const [deliveredMap, setDeliveredMap] = useState({})
  const listRef = useRef(null)
  const inputRef = useRef(null)

  // Hovercard
  const [cardOpen, setCardOpen] = useState(false)
  const [cardTarget, setCardTarget] = useState({ userId: null, handle: null, rect: null })

  const canSend = useMemo(
    () => open && me?.id && convoId != null && text.trim().length > 0 && !sending,
    [open, me?.id, convoId, text, sending]
  )

  useEffect(() => {
    if (!open || !convoId) { setMessages([]); return }
    let cancel = false
    ;(async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, convo_id, sender_id, body, created_at, read_at')
        .eq('convo_id', convoId)
        .order('created_at', { ascending: true })
      if (!cancel) {
        if (error) console.error(error)
        setMessages(data || [])
        setTimeout(() => listRef.current?.scrollTo({ top: 9e9 }), 50)
        markAllIncomingRead(data || [])
      }
    })()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, convoId])

  useEffect(() => {
    if (!open || !convoId) return
    const ch = supabase
      .channel(`msgs:${convoId}`)
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'messages', filter:`convo_id=eq.${convoId}` },
        (payload) => {
          const m = payload.new
          setMessages(prev => [...prev, m])
          setTimeout(() => listRef.current?.scrollTo({ top: 9e9 }), 10)
          if (m.sender_id !== me?.id) {
            broadcastDelivered(m.id)
            markIncomingRead([m.id])
          }
        })
      .on('postgres_changes',
        { event:'UPDATE', schema:'public', table:'messages', filter:`convo_id=eq.${convoId}` },
        (payload) => {
          const updated = payload.new
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [open, convoId, me?.id])

  useEffect(() => {
    if (!open || !convoId) return
    const ch = supabase.channel(`typing:${convoId}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event:'typing' }, (payload) => {
      const { user_id, handle } = payload?.payload || {}
      if (!user_id || user_id === me?.id) return
      setTypingFrom(handle || 'Someone')
      if (typingClearTimer.current) clearTimeout(typingClearTimer.current)
      typingClearTimer.current = setTimeout(() => setTypingFrom(null), 2500)
    })
    ch.subscribe()
    return () => {
      if (typingClearTimer.current) clearTimeout(typingClearTimer.current)
      supabase.removeChannel(ch)
    }
  }, [open, convoId, me?.id])

  function sendTyping() {
    const now = Date.now()
    if (now - lastTypingSentAt.current < 1500) return
    lastTypingSentAt.current = now
    supabase.channel(`typing:${convoId}`, { config: { broadcast: { self: false } } })
      .send({ type:'broadcast', event:'typing', payload:{ user_id: me?.id, handle: me?.email || 'Someone' } })
      .catch(()=>{})
  }

  useEffect(() => {
    if (!open || !convoId) return
    const ch = supabase.channel(`acks:${convoId}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event:'delivered' }, (payload) => {
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
      .send({ type:'broadcast', event:'delivered', payload:{ message_id: messageId, from_user: me?.id } })
      .catch(()=>{})
  }

  async function markIncomingRead(ids) {
    if (!ids?.length) return
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids)
      .neq('sender_id', me.id)
      .is('read_at', null)
  }
  async function markAllIncomingRead(list) {
    const unread = (list || messages).filter(m => m.sender_id !== me?.id && !m.read_at).map(m => m.id)
    if (unread.length) await markIncomingRead(unread)
  }
  useEffect(() => {
    if (!open) return
    const onFocus = () => markAllIncomingRead()
    window.addEventListener('focus', onFocus)
    const t = setInterval(markAllIncomingRead, 3000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messages, me?.id])

  async function handleSend(e) {
    e?.preventDefault?.()
    if (!canSend) return
    setSending(true)
    try {
      const body = text.trim()
      const { error } = await supabase.from('messages').insert({
        convo_id: convoId,
        sender_id: me.id,
        body
      })
      if (error) throw error
      setText(''); inputRef.current?.focus()
    } catch (e) {
      console.error(e); alert('Could not send. Try again.')
    } finally { setSending(false) }
  }

  function computeStatus(m, mine) {
    if (!mine) return { icon:null, read:false }
    if (m.read_at) return { icon:'✓✓', read:true }
    if (deliveredMap[m.id]) return { icon:'✓✓', read:false }
    return { icon:'✓', read:false }
  }

  // open hovercard for peer (header)
  function openCardForPeer(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    setCardTarget({ userId: peer?.id || null, handle: peer?.handle || null, rect })
    setCardOpen(true)
  }
  // open hovercard for a message (other user only)
  function openCardForMessage(e, msg) {
    if (msg.sender_id === me?.id) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setCardTarget({ userId: msg.sender_id, handle: null, rect })
    setCardOpen(true)
  }

  if (!open) return null

  return (
    <div style={wrap}>
      <div style={dock}>
        <div style={head}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <strong>Messages</strong>
            {peer?.handle && (
              <button
                type="button"
                className="linklike"
                onMouseEnter={openCardForPeer}
                onFocus={openCardForPeer}
                onClick={openCardForPeer}
                style={{ color:'var(--muted)' }}
                title={`@${peer.handle}`}
              >
                @{peer.handle}
              </button>
            )}
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div ref={listRef} style={list}>
          {!convoId && (
            <div className="muted" style={{ padding:12, textAlign:'center' }}>
              No conversation selected.
            </div>
          )}

          {convoId && messages.map(m => {
            const mine = m.sender_id === me?.id
            const status = computeStatus(m, mine)
            return (
              <div
                key={m.id}
                onContextMenu={(e) => openCardForMessage(e, m)}
                onTouchStart={(e) => openCardForMessage(e, m)}
                style={{ display:'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}
              >
                <div style={{
                  maxWidth:'78%', margin:'6px 8px', padding:'8px 10px', borderRadius:12,
                  background: mine ? 'linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)' : '#fff',
                  color: mine ? '#fff' : '#111',
                  border: mine ? '1px solid transparent' : '1px solid var(--border)',
                  whiteSpace:'pre-wrap', wordBreak:'break-word', position:'relative'
                }}>
                  {m.body}
                  {mine && (
                    <span style={{
                      position:'absolute', right:8, bottom:-16, fontSize:12,
                      color: status.read ? 'var(--primary)' : '#9ca3af'
                    }}>{status.icon}</span>
                  )}
                </div>
              </div>
            )
          })}

          {typingFrom && (
            <div className="muted" style={{ padding:'4px 10px' }}>{typingFrom} is typing…</div>
          )}
        </div>

        <form onSubmit={handleSend} style={composer}>
          <textarea
            ref={inputRef}
            rows={1}
            placeholder={convoId ? 'Type a message…' : 'Open a conversation to chat'}
            disabled={!convoId}
            value={text}
            onChange={(e) => { setText(e.target.value); sendTyping() }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            style={ta}
          />
          <button className="btn btn-primary" type="submit" disabled={!canSend}>Send</button>
        </form>
      </div>

      {/* Hovercard */}
      <ProfileHoverCard
        userId={cardTarget.userId}
        handle={cardTarget.handle}
        anchorRect={cardTarget.rect}
        open={cardOpen}
        onClose={() => setCardOpen(false)}
      />
    </div>
  )
}

const wrap = { position:'fixed', right:16, bottom:16, zIndex:50 }
const dock = {
  width:360, maxHeight:'70vh', background:'#fff', border:'1px solid var(--border)',
  borderRadius:14, overflow:'hidden', boxShadow:'0 12px 32px rgba(0,0,0,0.18)',
  display:'grid', gridTemplateRows:'auto 1fr auto'
}
const head = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:'1px solid var(--border)', background:'#fafafa' }
const list = { overflowY:'auto', padding:'8px 4px' }
const composer = { display:'flex', gap:8, padding:'10px', borderTop:'1px solid var(--border)', background:'#fff' }
const ta = { flex:1, minHeight:38, maxHeight:120, resize:'vertical' }







