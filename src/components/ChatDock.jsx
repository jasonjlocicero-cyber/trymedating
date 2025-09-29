// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import ProfileHoverCard from './ProfileHoverCard'

export default function ChatDock({ me, convoId, peer, open, onClose }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  // typing / delivery
  const [typingFrom, setTypingFrom] = useState(null)
  const typingClearTimer = useRef(null)
  const lastTypingSentAt = useRef(0)
  const [deliveredMap, setDeliveredMap] = useState({})

  // search state
  const [q, setQ] = useState('')
  const [matchIdx, setMatchIdx] = useState(0) // 0-based index across all matches
  const matchesRef = useRef([]) // [{msgId, elId}, ...]

  // hovercard
  const [cardOpen, setCardOpen] = useState(false)
  const [cardTarget, setCardTarget] = useState({ userId: null, handle: null, rect: null })

  const listRef = useRef(null)
  const inputRef = useRef(null)

  const canSend = useMemo(
    () => open && me?.id && convoId != null && text.trim().length > 0 && !sending,
    [open, me?.id, convoId, text, sending]
  )

  // ===== Load + realtime =====
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
          if (m.sender_id !== me?.id) { broadcastDelivered(m.id); markIncomingRead([m.id]) }
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

  // typing
  useEffect(() => {
    if (!open || !convoId) return
    const ch = supabase.channel(`typing:${convoId}`, { config: { broadcast: { self:false } } })
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
    supabase.channel(`typing:${convoId}`, { config: { broadcast: { self:false } } })
      .send({ type:'broadcast', event:'typing', payload:{ user_id: me?.id, handle: me?.email || 'Someone' } })
      .catch(()=>{})
  }

  // delivery acks
  useEffect(() => {
    if (!open || !convoId) return
    const ch = supabase.channel(`acks:${convoId}`, { config: { broadcast: { self:false } } })
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
    supabase.channel(`acks:${convoId}`, { config: { broadcast: { self:false } } })
      .send({ type:'broadcast', event:'delivered', payload:{ message_id: messageId, from_user: me?.id } })
      .catch(()=>{})
  }

  // read receipts
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

  // send
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

  // ===== Hovercard helpers =====
  function openCardForPeer(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    setCardTarget({ userId: peer?.id || null, handle: peer?.handle || null, rect })
    setCardOpen(true)
  }
  function openCardForMessage(e, msg) {
    if (msg.sender_id === me?.id) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setCardTarget({ userId: msg.sender_id, handle: null, rect })
    setCardOpen(true)
  }

  // ===== Search helpers =====
  const normQ = q.trim().toLowerCase()
  useEffect(() => {
    // rebuild match index whenever messages or query change
    const next = []
    if (normQ && messages.length) {
      messages.forEach((m) => {
        const idxs = findAllIdxs(m.body || '', normQ)
        idxs.forEach((_i, localIdx) => {
          next.push({ msgId: m.id, elId: `msg-${m.id}`, localIdx })
        })
      })
    }
    matchesRef.current = next
    if (next.length === 0) setMatchIdx(0)
    else setMatchIdx((i) => Math.min(i, next.length - 1))
    // scroll to current if still valid
    setTimeout(() => {
      if (next.length) scrollToMatch(matchesRef.current[matchIdx]?.elId, listRef)
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normQ, messages])

  const totalMatches = matchesRef.current.length
  const hasMatches = totalMatches > 0

  function goto(delta) {
    if (!hasMatches) return
    const next = (matchIdx + delta + totalMatches) % totalMatches
    setMatchIdx(next)
    const m = matchesRef.current[next]
    if (m) scrollToMatch(m.elId, listRef)
  }

  // ===== UI =====
  if (!open) return null

  return (
    <div style={wrap}>
      <div style={dock}>
        {/* Header */}
        <div style={head}>
          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
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

        {/* Search bar */}
        <div style={searchBar}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search in conversation…"
            style={searchInput}
          />
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div className="muted" style={{ fontSize:12, minWidth:72, textAlign:'right' }}>
              {normQ ? (hasMatches ? `${matchIdx+1}/${totalMatches}` : '0/0') : ''}
            </div>
            <button className="btn" onClick={() => goto(-1)} disabled={!hasMatches} title="Previous">Prev</button>
            <button className="btn" onClick={() => goto(+1)} disabled={!hasMatches} title="Next">Next</button>
          </div>
        </div>

        {/* Messages */}
        <div ref={listRef} style={list}>
          {!convoId && (
            <div className="muted" style={{ padding:12, textAlign:'center' }}>
              No conversation selected.
            </div>
          )}

          {convoId && messages.map(m => {
            const mine = m.sender_id === me?.id
            const status = computeStatus(m, mine)
            const isOther = !mine
            return (
              <div
                key={m.id}
                id={`msg-${m.id}`}
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
                  {renderHighlighted(m.body || '', normQ, isOther ? '#111' : '#fff')}
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

        {/* Composer */}
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

/* ========== Helpers ========== */

function findAllIdxs(text, qLower) {
  const src = String(text || '')
  if (!qLower) return []
  const hay = src.toLowerCase()
  const out = []
  let pos = 0
  while (true) {
    const i = hay.indexOf(qLower, pos)
    if (i === -1) break
    out.push(i)
    pos = i + qLower.length
  }
  return out
}

function renderHighlighted(text, qLower, color) {
  if (!qLower) return text
  const hay = String(text || '')
  const idxs = findAllIdxs(hay, qLower)
  if (idxs.length === 0) return hay
  const parts = []
  let last = 0
  const len = qLower.length
  for (let k = 0; k < idxs.length; k++) {
    const i = idxs[k]
    if (i > last) parts.push(<span key={`t-${k}-${last}`}>{hay.slice(last, i)}</span>)
    const seg = hay.slice(i, i + len)
    parts.push(
      <mark key={`m-${k}-${i}`} style={{
        background: 'rgba(255, 231, 150, 0.9)',
        color,
        padding: '0 2px',
        borderRadius: 3
      }}>{seg}</mark>
    )
    last = i + len
  }
  if (last < hay.length) parts.push(<span key={`end-${last}`}>{hay.slice(last)}</span>)
  return <>{parts}</>
}

function scrollToMatch(elId, listRef) {
  if (!elId) return
  const el = document.getElementById(elId)
  if (el && listRef.current) {
    const container = listRef.current
    const top = el.offsetTop - 24
    container.scrollTo({ top, behavior: 'smooth' })
    el.animate(
      [{ transform:'scale(1)' }, { transform:'scale(1.02)' }, { transform:'scale(1)' }],
      { duration: 600 }
    )
  }
}

/* ========== Styles ========== */

const wrap = { position:'fixed', right:16, bottom:16, zIndex:50 }
const dock = {
  width:360, maxHeight:'70vh', background:'#fff', border:'1px solid var(--border)',
  borderRadius:14, overflow:'hidden', boxShadow:'0 12px 32px rgba(0,0,0,0.18)',
  display:'grid', gridTemplateRows:'auto auto 1fr auto'
}
const head = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:'1px solid var(--border)', background:'#fafafa' }
const searchBar = { display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'8px 10px', borderBottom:'1px solid var(--border)', background:'#fff' }
const searchInput = {
  flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'#fff'
}
const list = { overflowY:'auto', padding:'8px 4px' }
const composer = { display:'flex', gap:8, padding:'10px', borderTop:'1px solid var(--border)', background:'#fff' }
const ta = { flex:1, minHeight:38, maxHeight:120, resize:'vertical' }







