// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * EXPECTED TABLE: public.messages
 * columns: id (uuid), sender_id (uuid), receiver_id (uuid), body (text), created_at (timestamptz), attachment_url (text, nullable)
 * RLS: users can select messages where sender_id = auth.uid() OR receiver_id = auth.uid()
 *
 * PROPS:
 * - me: { id: string } current user (required)
 * - partnerId?: string (optional) current open conversation partner
 * - partnerName?: string (optional) for "is typing…" label
 * - onClose?: () => void (optional)
 * - onUnreadChange?: (n: number) => void (optional) — get unread count updates
 */
export default function ChatDock({ me, partnerId, partnerName, onClose, onUnreadChange }) {
  const authed = !!me?.id
  const canChat = authed && !!partnerId

  const [messages, setMessages] = useState([]) // ascending by time
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  // typing
  const [partnerTyping, setPartnerTyping] = useState(false)
  const typingTimerRef = useRef(null)
  const lastTypingSentRef = useRef(0)

  // unread
  const [unread, setUnread] = useState(0)

  const scrollRef = useRef(null)
  const listRef = useRef(null)

  // formatted partner scope for queries
  const scope = useMemo(() => {
    if (!canChat) return null
    return {
      orSender: `and(sender_id.eq.${me.id},receiver_id.eq.${partnerId})`,
      orReceiver: `and(sender_id.eq.${partnerId},receiver_id.eq.${me.id})`
    }
  }, [canChat, me?.id, partnerId])

  // helper: at-bottom check
  function isNearBottom() {
    const el = listRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }
  // helper: scroll to bottom
  function scrollToBottom(smooth = false) {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight + 1000, behavior: smooth ? 'smooth' : 'auto' })
  }

  // format time / day dividers
  function dayLabel(d) {
    const dt = new Date(d)
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const isSameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    const yest = new Date(now)
    yest.setDate(now.getDate() - 1)
    if (isSameDay(dt, now)) return 'Today'
    if (isSameDay(dt, yest)) return 'Yesterday'
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  }

  // initial load
  useEffect(() => {
    let cancel = false
    async function load() {
      if (!canChat) { setMessages([]); setUnread(0); onUnreadChange?.(0); return }
      setLoading(true); setErr('')
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .or(`${scope.orSender},${scope.orReceiver}`)
          .order('created_at', { ascending: true })
          .limit(500)
        if (error) throw error
        if (!cancel) {
          setMessages(data || [])
          setTimeout(() => {
            scrollToBottom(false)
            // you just opened the thread — clear unread
            setUnread(0)
            onUnreadChange?.(0)
          }, 0)
        }
      } catch (e) {
        if (!cancel) setErr(e.message || 'Failed to load messages')
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    load()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canChat, scope?.orSender, scope?.orReceiver])

  // realtime inserts for this 1:1 thread
  useEffect(() => {
    if (!canChat) return
    const chanId = `messages:${me.id}:${partnerId}`
    const channel = supabase.channel(chanId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new
          // only keep if this row is for the exact 1:1
          const isOurs =
            (row.sender_id === me.id && row.receiver_id === partnerId) ||
            (row.sender_id === partnerId && row.receiver_id === me.id)
          if (!isOurs) return

          setMessages(prev => {
            if (prev.some(m => m.id === row.id)) return prev
            const next = [...prev, row].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))
            return next
          })

          // Unread logic: only count partner's messages
          const mine = row.sender_id === me.id
          const windowHidden = typeof document !== 'undefined' ? document.hidden : false
          const away = !isNearBottom() || windowHidden
          if (!mine && away) {
            setUnread(u => {
              const nu = u + 1
              onUnreadChange?.(nu)
              return nu
            })
          }

          // smooth scroll if you're already near bottom
          if (isNearBottom()) {
            setTimeout(() => scrollToBottom(true), 10)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [canChat, me?.id, partnerId, onUnreadChange])

  // Subscribe to typing via Realtime broadcast (no DB)
  useEffect(() => {
    if (!canChat) return
    const chanId = `typing:${me.id}:${partnerId}`
    const channel = supabase.channel(chanId, { config: { broadcast: { self: false } } })

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload?.from === partnerId && payload?.to === me.id) {
          setPartnerTyping(true)
          // clear after 3s of silence
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => setPartnerTyping(false), 3000)
        }
      })
      .on('broadcast', { event: 'stop_typing' }, (payload) => {
        if (payload?.from === partnerId && payload?.to === me.id) {
          setPartnerTyping(false)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
  }, [canChat, me?.id, partnerId])

  // send typing broadcast (throttled to 1 every 1s)
  function sendTyping() {
    const now = Date.now()
    if (now - lastTypingSentRef.current < 1000) return
    lastTypingSentRef.current = now
    supabase.channel(`typing:${me.id}:${partnerId}`, { config: { broadcast: { self: false } } })
      .send({ type: 'broadcast', event: 'typing', payload: { from: me.id, to: partnerId } })
  }
  function sendStopTyping() {
    supabase.channel(`typing:${me.id}:${partnerId}`, { config: { broadcast: { self: false } } })
      .send({ type: 'broadcast', event: 'stop_typing', payload: { from: me.id, to: partnerId } })
  }

  // auto-scroll when local messages change (keep pinned if near bottom)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (isNearBottom()) scrollToBottom(true)
  }, [messages])

  // clear unread when user returns focus or scrolls to bottom
  useEffect(() => {
    function handleFocus() {
      if (isNearBottom()) {
        setUnread(0)
        onUnreadChange?.(0)
      }
    }
    function handleScroll() {
      if (isNearBottom()) {
        setUnread(0)
        onUnreadChange?.(0)
      }
    }
    window.addEventListener('focus', handleFocus)
    const el = listRef.current
    if (el) el.addEventListener('scroll', handleScroll)
    return () => {
      window.removeEventListener('focus', handleFocus)
      if (el) el.removeEventListener('scroll', handleScroll)
    }
  }, [onUnreadChange])

  async function sendMessage() {
    if (!canChat) return
    const body = text.trim()
    if (!body) return
    setSending(true); setErr('')
    try {
      // optimistic append (temporary id)
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2,7)}`
      const now = new Date().toISOString()
      const optimistic = {
        id: tempId,
        sender_id: me.id,
        receiver_id: partnerId,
        body,
        created_at: now
      }
      setMessages(prev => [...prev, optimistic])
      setText('')
      sendStopTyping()
      scrollToBottom(true)

      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: me.id,
          receiver_id: partnerId,
          body
        })
        .select('*')
        .single()
      if (error) throw error

      // replace optimistic with real row
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === tempId)
        if (idx === -1) return prev
        const next = [...prev]
        next[idx] = data
        return next
      })
    } catch (e) {
      // mark optimistic bubble as failed
      setMessages(prev => prev.map(m =>
        m.id?.startsWith('tmp_') ? { ...m, _failed: true } : m
      ))
      setErr(e.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!sending) sendMessage()
    }
  }

  // group by day for dividers
  const threaded = useMemo(() => {
    const out = []
    let lastDay = ''
    for (const m of messages) {
      const day = dayLabel(m.created_at)
      if (day !== lastDay) {
        out.push({ _divider: true, label: day, _id: `divider-${day}-${out.length}` })
        lastDay = day
      }
      out.push(m)
    }
    return out
  }, [messages])

  if (!authed || !partnerId) {
    return null
  }

  return (
    <div
      ref={scrollRef}
      className="chatdock"
      style={{
        position:'fixed',
        right:16, bottom:16,
        width: 360, maxWidth:'calc(100vw - 24px)',
        height: 520,
        display:'flex',
        flexDirection:'column',
        background:'#fff',
        border:'1px solid var(--border)',
        borderRadius:12,
        boxShadow:'0 12px 32px rgba(0,0,0,0.12)',
        overflow:'hidden',
        zIndex: 50
      }}
    >
      {/* Header */}
      <div style={{
        padding:'10px 12px',
        borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', justifyContent:'space-between'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ fontWeight:800 }}>Messages</div>
          {unread > 0 && (
            <span
              title={`${unread} unread`}
              style={{
                display:'inline-block',
                minWidth:18, height:18, lineHeight:'18px',
                textAlign:'center',
                fontSize:11, fontWeight:700,
                background:'#ef4444', color:'#fff',
                borderRadius:999, padding:'0 6px'
              }}
            >
              {unread}
            </span>
          )}
        </div>
        <button
          className="btn btn-neutral"
          onClick={onClose}
          aria-label="Close messages"
          style={{ padding:'4px 8px' }}
        >
          ✕
        </button>
      </div>

      {/* List */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY:'auto',
          padding:'10px 12px',
          background:'#fafafa'
        }}
        onScroll={() => {
          if (isNearBottom() && unread) { setUnread(0); onUnreadChange?.(0) }
        }}
      >
        {loading && <div className="muted">Loading…</div>}
        {err && <div className="helper-error" style={{ marginBottom:8 }}>{err}</div>}
        {!loading && threaded.length === 0 && (
          <div className="muted">Start the conversation…</div>
        )}

        {threaded.map((m, idx) => {
          if (m._divider) {
            return (
              <div key={m._id} style={{ textAlign:'center', margin:'8px 0' }}>
                <span style={{
                  fontSize:12, color:'var(--muted)',
                  background:'#fff', padding:'2px 8px', border:'1px solid var(--border)', borderRadius:999
                }}>
                  {m.label}
                </span>
              </div>
            )
          }
          const mine = m.sender_id === me.id
          return (
            <div
              key={m.id || `temp-${idx}`}
              style={{
                display:'flex',
                justifyContent: mine ? 'flex-end' : 'flex-start',
                marginBottom: 6
              }}
            >
              <div style={{
                maxWidth:'78%',
                background: mine ? 'var(--brand-teal-50, #e6fffb)' : '#fff',
                border: `1px solid ${mine ? 'rgba(20,184,166,0.35)' : 'var(--border)'}`,
                padding:'8px 10px',
                borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                fontSize:14,
                whiteSpace:'pre-wrap',
                wordBreak:'break-word',
                position:'relative'
              }}>
                {m.body}
                {m._failed && (
                  <div style={{ fontSize:11, color:'#b91c1c', marginTop:4 }}>
                    Failed to send. Check your connection.
                  </div>
                )}
                <div style={{
                  position:'absolute',
                  bottom:-16,
                  right: mine ? 0 : 'auto',
                  left: mine ? 'auto' : 0,
                  fontSize:10,
                  color:'var(--muted)'
                }}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Typing indicator */}
      {partnerTyping && (
        <div style={{
          padding:'4px 12px',
          background:'#fff',
          color:'var(--muted)',
          fontSize:12,
          borderTop:'1px dashed var(--border)'
        }}>
          {partnerName ? `${partnerName} is typing…` : 'Typing…'}
        </div>
      )}

      {/* Composer */}
      <div style={{ borderTop:'1px solid var(--border)', padding:8, background:'#fff' }}>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          <textarea
            value={text}
            onChange={(e)=>{ setText(e.target.value); if (e.target.value) sendTyping(); else sendStopTyping() }}
            onBlur={sendStopTyping}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!sending) sendMessage()
              } else {
                // send typing on any keystroke that isn't enter
                if (e.key !== 'Enter') sendTyping()
              }
            }}
            placeholder="Type a message…  (Enter to send • Shift+Enter = newline)"
            rows={1}
            style={{
              flex:1,
              resize:'none',
              padding:'8px 10px',
              border:'1px solid var(--border)',
              borderRadius:10,
              maxHeight:120
            }}
          />
          <button
            className="btn btn-header"
            onClick={sendMessage}
            disabled={sending || !text.trim()}
            aria-label="Send message"
            title="Send (Enter)"
          >
            Send
          </button>
        </div>
        <div className="helper-muted" style={{ marginTop:4 }}>
          Enter to send • Shift+Enter for newline
        </div>
      </div>
    </div>
  )
}








