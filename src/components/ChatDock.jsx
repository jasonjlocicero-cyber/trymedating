// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock (full)
 * - Typing indicator (broadcast)
 * - Send status (sending/failed + retry)
 * - Auto-mark read on open + new incoming
 * - Delete own messages (with confirm)
 * - Report partner (header + ⋯ on partner messages)
 * - Pagination: loads latest 50, "Load older" for history
 * - Accept / Reject banner shown when connection pending (teal/coral)
 * - Composer always visible; Send disabled until accepted
 * - Header buttons: ✓ teal, Report amber, ✕ coral
 */

const PAGE_SIZE = 50
const REPORT_CATEGORIES = ['spam', 'harassment', 'fake', 'scam', 'other']

async function reportUser({ reporterId, reportedId }) {
  const categoryRaw = window.prompt(
    `Reason? Choose one:\n${REPORT_CATEGORIES.join(', ')}`,
    'spam'
  )
  if (!categoryRaw) return
  const category = categoryRaw.trim().toLowerCase()
  if (!REPORT_CATEGORIES.includes(category)) {
    alert(`Please choose one of: ${REPORT_CATEGORIES.join(', ')}`)
    return
  }
  const details = window.prompt('Add details (optional):', '') || ''
  const { error } = await supabase.from('reports').insert({
    reporter: reporterId,
    reported: reportedId,
    category,
    details
  })
  if (error) {
    alert(error.message || 'Failed to submit report')
  } else {
    alert('Report submitted. Thank you for helping keep the community safe.')
  }
}

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
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [peerTyping, setPeerTyping] = useState(false)
  const [menuOpenFor, setMenuOpenFor] = useState(null) // message id for ⋯ menu
  // none | pending_in | pending_out | accepted | unknown
  const [connStatus, setConnStatus] = useState('unknown')

  const listRef = useRef(null)
  const typingTimerRef = useRef(null)
  const nearBottomRef = useRef(true) // keep auto-scroll sticky
  const oldestTsRef = useRef(null)   // ISO string of oldest loaded created_at
  const lastScrollHeightRef = useRef(0) // preserve scroll when prepending
  const prevSnapshotRef = useRef([]) // rollback snapshot for delete

  const threadKey = useMemo(() => {
    const a = String(me?.id || '')
    const b = String(partnerId || '')
    return a < b ? `${a}-${b}` : `${b}-${a}`
  }, [me?.id, partnerId])

  const title = useMemo(() => partnerName || 'Conversation', [partnerName])
  const canType = !!me?.id

  // ---- Helpers ----
  function isInThisThread(m) {
    return (
      (m.sender === me?.id && m.recipient === partnerId) ||
      (m.sender === partnerId && m.recipient === me?.id)
    )
  }

  function trackScrollNearBottom() {
    if (!listRef.current) return
    const el = listRef.current
    const threshold = 60
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  function scrollToBottom() {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }

  function restoreScrollAfterPrepend() {
    const el = listRef.current
    if (!el) return
    const delta = el.scrollHeight - lastScrollHeightRef.current
    el.scrollTop = el.scrollTop + delta
  }

  // ---- Load latest messages (initial) ----
  const loadInitial = useCallback(async () => {
    if (!me?.id || !partnerId) {
      setMessages([])
      setHasMore(false)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, recipient, body, created_at, read_at')
      .or(
        `and(sender.eq.${me.id},recipient.eq.${partnerId}),and(sender.eq.${partnerId},recipient.eq.${me.id})`
      )
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) {
      setMessages([])
      setHasMore(false)
      setLoading(false)
      return
    }

    const reversed = (data || []).slice().reverse()
    setMessages(reversed)
    prevSnapshotRef.current = reversed
    setLoading(false)
    setHasMore((data || []).length === PAGE_SIZE)
    oldestTsRef.current = reversed.length ? reversed[0].created_at : null

    // mark read on initial open
    markThreadRead()
    setTimeout(scrollToBottom, 0)
  }, [me?.id, partnerId])

  // ---- Load older (pagination) ----
  const loadOlder = useCallback(async () => {
    if (!oldestTsRef.current) return
    setLoadingOlder(true)
    lastScrollHeightRef.current = listRef.current?.scrollHeight || 0

    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, recipient, body, created_at, read_at')
      .or(
        `and(sender.eq.${me.id},recipient.eq.${partnerId}),and(sender.eq.${partnerId},recipient.eq.${me.id})`
      )
      .lt('created_at', oldestTsRef.current)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) {
      setLoadingOlder(false)
      return
    }

    const batch = (data || []).slice().reverse()
    setMessages(prev => {
      const next = [...batch, ...prev]
      prevSnapshotRef.current = next
      return next
    })
    setHasMore((data || []).length === PAGE_SIZE)
    oldestTsRef.current = batch.length ? batch[0].created_at : oldestTsRef.current
    setLoadingOlder(false)
    restoreScrollAfterPrepend()
  }, [me?.id, partnerId])

  // ---- Mount / thread change ----
  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  // ---- Load connection status for this pair ----
  useEffect(() => {
    let cancel = false
    async function loadConn() {
      if (!me?.id || !partnerId) { setConnStatus('none'); return }
      const { data, error } = await supabase
        .from('connection_requests')
        .select('requester, recipient, status')
        .or(`and(requester.eq.${me.id},recipient.eq.${partnerId}),and(requester.eq.${partnerId},recipient.eq.${me.id})`)
        .maybeSingle()

      if (cancel) return
      if (error && error.code !== 'PGRST116') { setConnStatus('none'); return }
      if (!data) { setConnStatus('none'); return }

      if (data.status === 'accepted') setConnStatus('accepted')
      else if (data.status === 'pending' && data.requester === me.id) setConnStatus('pending_out')
      else if (data.status === 'pending' && data.recipient === me.id) setConnStatus('pending_in')
      else setConnStatus('none')
    }
    loadConn()
    return () => { cancel = true }
  }, [me?.id, partnerId])

  // ---- Realtime connection status for this pair ----
  useEffect(() => {
    if (!me?.id || !partnerId) return

    const ch = supabase
      .channel(`conn-${me.id}-${partnerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'connection_requests' },
        payload => {
          const r = payload?.new
          if (!r) return
          const isThisPair =
            (r.requester === me.id && r.recipient === partnerId) ||
            (r.requester === partnerId && r.recipient === me.id)
          if (!isThisPair) return
          if (r.status === 'pending') {
            if (r.requester === me.id) setConnStatus('pending_out')
            else if (r.recipient === me.id) setConnStatus('pending_in')
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'connection_requests' },
        payload => {
          const r = payload?.new
          if (!r) return
          const isThisPair =
            (r.requester === me.id && r.recipient === partnerId) ||
            (r.requester === partnerId && r.recipient === me.id)
          if (!isThisPair) return
          if (r.status === 'accepted') setConnStatus('accepted')
          else if (r.status === 'rejected') setConnStatus('none')
          else if (r.status === 'pending') {
            if (r.requester === me.id) setConnStatus('pending_out')
            else if (r.recipient === me.id) setConnStatus('pending_in')
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [me?.id, partnerId])

  // ---- Realtime inserts/updates/deletes for messages ----
  useEffect(() => {
    const ch = supabase
      .channel(`msg-${me?.id}-${partnerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          const m = payload.new
          if (!isInThisThread(m)) return
          setMessages(prev => {
            const next = [...prev, m]
            prevSnapshotRef.current = next
            return next
          })
          if (m.recipient === me?.id && !m.read_at) markThreadRead()
          onUnreadChange && onUnreadChange()
          if (nearBottomRef.current) setTimeout(scrollToBottom, 0)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => onUnreadChange && onUnreadChange()
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        payload => {
          const deletedId = payload.old?.id
          if (!deletedId) return
          setMessages(prev => {
            const next = prev.filter(m => m.id !== deletedId)
            prevSnapshotRef.current = next
            return next
          })
          onUnreadChange && onUnreadChange()
        }
      )
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [me?.id, partnerId])

  // ---- Typing indicator via broadcast ----
  useEffect(() => {
    const typingChannel = supabase.channel(`typing:${threadKey}`)
    typingChannel
      .on('broadcast', { event: 'typing' }, payload => {
        const from = payload?.payload?.from
        if (from && from !== me?.id) {
          setPeerTyping(true)
          window.clearTimeout(typingTimerRef.current)
          typingTimerRef.current = window.setTimeout(() => setPeerTyping(false), 2500)
        }
      })
      .subscribe()
    return () => {
      window.clearTimeout(typingTimerRef.current)
      supabase.removeChannel(typingChannel)
    }
  }, [threadKey, me?.id])

  function broadcastTyping() {
    supabase.channel(`typing:${threadKey}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { from: me?.id, at: Date.now() }
    })
  }

  // ---- Scroll tracking ----
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = () => {
      setMenuOpenFor(null) // close ⋯ menus when scrolling
      trackScrollNearBottom()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // ---- Send (optimistic) with relaxed guard ----
  async function send(e) {
    e?.preventDefault?.()
    const body = text.trim()
    if (!body || !partnerId) return
    if (connStatus !== 'accepted') {
      alert('You need to accept the connection before sending. Use the Accept button above.')
      return
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic = {
      id: tempId,
      sender: me.id,
      recipient: partnerId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      _status: 'sending'
    }
    setMessages(prev => {
      const next = [...prev, optimistic]
      prevSnapshotRef.current = next
      return next
    })
    setText('')
    setTimeout(scrollToBottom, 0)

    const { data, error } = await supabase.from('messages').insert({
      sender: me.id,
      recipient: partnerId,
      body
    }).select('id, sender, recipient, body, created_at, read_at').single()

    if (error || !data) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed' } : m))
    } else {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...data } : m))
    }
  }

  async function retrySend(failedMsg) {
    if (!partnerId) return
    if (connStatus !== 'accepted') {
      alert('You need to accept the connection before sending. Use the Accept button above.')
      return
    }
    setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, _status: 'sending' } : m))
    const { data, error } = await supabase.from('messages').insert({
      sender: me.id,
      recipient: partnerId,
      body: failedMsg.body
    }).select('id, sender, recipient, body, created_at, read_at').single()
    if (error || !data) {
      setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, _status: 'failed' } : m))
    } else {
      setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...data } : m))
    }
  }

  // ---- Delete own message ----
  async function deleteMessage(id) {
    setMenuOpenFor(null)
    if (!id) return
    const yes = window.confirm('Delete this message for everyone? This cannot be undone.')
    if (!yes) return
    // Snapshot for rollback
    const snapshot = prevSnapshotRef.current
    setMessages(prev => prev.filter(m => m.id !== id))
    const { error } = await supabase.from('messages').delete().eq('id', id)
    if (error) {
      // rollback on error
      setMessages(snapshot)
      alert(error.message || 'Failed to delete message')
    }
  }

  // ---- Accept / Reject helpers ----
  async function acceptConnection() {
    const { error } = await supabase
      .from('connection_requests')
      .update({ status: 'accepted', decided_at: new Date().toISOString() })
      .or(`and(requester.eq.${partnerId},recipient.eq.${me.id}),and(requester.eq.${me.id},recipient.eq.${partnerId})`)
    if (error) return alert(error.message)
    setConnStatus('accepted')
  }
  async function rejectConnection() {
    const { error } = await supabase
      .from('connection_requests')
      .update({ status: 'rejected', decided_at: new Date().toISOString() })
      .or(`and(requester.eq.${partnerId},recipient.eq.${me.id}),and(requester.eq.${me.id},recipient.eq.${partnerId})`)
    if (error) return alert(error.message)
    setConnStatus('none')
  }

  // ---- Mark incoming as read ----
  async function markThreadRead() {
    if (!me?.id || !partnerId) return
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .eq('recipient', me.id)
      .eq('sender', partnerId)
    onUnreadChange && onUnreadChange()
  }

  // ---- keyboard helpers ----
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
    // lightweight throttle
    if (!typingTimerRef.current) {
      broadcastTyping()
      typingTimerRef.current = window.setTimeout(() => {
        typingTimerRef.current = null
      }, 800)
    }
  }

  // ---- UI ----
  return (
    <div
      style={{
        position:'fixed', right:16, bottom:80,
        width: 360, maxWidth:'calc(100vw - 24px)',
        background:'#fff', border:'1px solid var(--border)', borderRadius:12,
        boxShadow:'0 12px 32px rgba(0,0,0,0.12)', zIndex: 1002,
        display:'flex', flexDirection:'column', overflow:'hidden'
      }}
      onClick={() => setMenuOpenFor(null)}
    >
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ fontWeight:800 }}>{title}</div>
        <div style={{ display:'flex', gap:8 }}>
          {/* Teal ✓ */}
          <button
            className="btn"
            onClick={markThreadRead}
            title="Mark read"
            aria-label="Mark read"
            style={{
              background: '#0f766e', color:'#fff', border:'1px solid #0f766e',
              padding:'6px 10px', borderRadius:8, fontWeight:700
            }}
          >
            ✓
          </button>

          {/* Amber Report */}
          {partnerId && (
            <button
              className="btn"
              onClick={() => reportUser({ reporterId: me.id, reportedId: partnerId })}
              title="Report this user"
              aria-label="Report this user"
              style={{
                background:'#f59e0b', color:'#111827', border:'1px solid #d97706',
                padding:'6px 10px', borderRadius:8, fontWeight:700
              }}
            >
              Report
            </button>
          )}

          {/* Coral ✕ */}
          <button
            className="btn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            style={{
              background:'#f43f5e', color:'#fff', border:'1px solid #e11d48',
              padding:'6px 10px', borderRadius:8, fontWeight:700
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* connection status banner */}
      {connStatus === 'pending_in' && (
        <div
          style={{
            padding: 10,
            background: '#fef3c7',
            borderBottom: '1px solid var(--border)',
            textAlign: 'center'
          }}
        >
          <div style={{ marginBottom: 6 }}>
            This person wants to connect with you.
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button
              className="btn"
              onClick={rejectConnection}
              style={{
                background:'#f43f5e', color:'#fff', border:'1px solid #e11d48',
                padding:'6px 10px', borderRadius:8, fontWeight:700
              }}
            >
              Reject
            </button>
            <button
              className="btn"
              onClick={acceptConnection}
              style={{
                background:'#0f766e', color:'#fff', border:'1px solid #0f766e',
                padding:'6px 10px', borderRadius:8, fontWeight:700
              }}
            >
              Accept
            </button>
          </div>
        </div>
      )}
      {connStatus === 'pending_out' && (
        <div
          style={{
            padding: 10,
            background: '#f1f5f9',
            borderBottom: '1px solid var(--border)',
            textAlign: 'center'
          }}
        >
          Request sent — waiting for acceptance.
        </div>
      )}

      {/* list */}
      <div
        ref={listRef}
        style={{ padding:12, overflowY:'auto', maxHeight: 420 }}
      >
        {loading && <div className="muted">Loading…</div>}

        {!loading && (
          <>
            {hasMore && (
              <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
                <button
                  className="btn btn-neutral"
                  disabled={loadingOlder}
                  onClick={loadOlder}
                  title="Load older messages"
                >
                  {loadingOlder ? 'Loading…' : 'Load older'}
                </button>
              </div>
            )}

            {!partnerId && <div className="muted">Select a person to start chatting.</div>}

            {partnerId && messages.length === 0 && <div className="muted">Say hi 👋</div>}

            {partnerId && messages.map(m => {
              const mine = m.sender === me?.id
              const failed = m._status === 'failed'
              const sending = m._status === 'sending'
              const showMenuMine = mine && !sending && !failed
              const showPartnerMenu = !mine // allow report on partner's messages

              return (
                <div key={m.id} style={{ display:'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom:8, position:'relative' }}>
                  <div
                    style={{
                      maxWidth:'78%', padding:'8px 10px', borderRadius: 12,
                      background: mine ? '#0f766e' : '#f8fafc',
                      color: mine ? '#fff' : '#0f172a',
                      border: mine ? 'none' : '1px solid var(--border)'
                    }}
                    onMouseLeave={() => setMenuOpenFor(null)}
                  >
                    <div style={{ whiteSpace:'pre-wrap' }}>{m.body}</div>
                    <div className="muted" style={{ fontSize:11, marginTop:4, display:'flex', gap:8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                      {mine && sending && <span>· sending…</span>}
                      {mine && failed && (
                        <>
                          <span style={{ color:'#f43f5e' }}>· failed</span>
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

                    {/* ⋯ menu trigger */}
                    {(showMenuMine || showPartnerMenu) && (
                      <button
                        type="button"
                        className="btn btn-neutral"
                        onClick={(e) => { e.stopPropagation(); setMenuOpenFor(menuOpenFor === m.id ? null : m.id) }}
                        title="More"
                        style={{
                          position:'absolute',
                          top: -6,
                          right: mine ? -6 : 'auto',
                          left: mine ? 'auto' : -6,
                          padding: '0 6px',
                          fontSize: 12
                        }}
                      >
                        ⋯
                      </button>
                    )}

                    {/* menu */}
                    {menuOpenFor === m.id && (
                      <div
                        style={{
                          position:'absolute',
                          top: 18,
                          right: mine ? -6 : 'auto',
                          left: mine ? 'auto' : -6,
                          background:'#fff',
                          border:'1px solid var(--border)',
                          borderRadius:8,
                          boxShadow:'0 8px 18px rgba(0,0,0,0.12)',
                          padding:6,
                          zIndex: 5
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {mine ? (
                          <button
                            className="btn btn-neutral"
                            style={{ width: '100%' }}
                            onClick={() => deleteMessage(m.id)}
                          >
                            Delete
                          </button>
                        ) : (
                          <button
                            className="btn btn-neutral"
                            style={{ width: '100%' }}
                            onClick={() => {
                              setMenuOpenFor(null)
                              reportUser({ reporterId: me.id, reportedId: partnerId })
                            }}
                          >
                            Report user
                          </button>
                        )}
                      </div>
                    )}
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
          </>
        )}
      </div>

      {/* composer — always visible so you can type, but Send is gated */}
      {(!!me?.id && partnerId) ? (
        <form onSubmit={send} style={{ display:'flex', gap:8, padding:12, borderTop:'1px solid var(--border)' }}>
          <textarea
            className="input"
            value={text}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder={
              connStatus === 'accepted'
                ? 'Type a message…'
                : (connStatus === 'pending_in'
                    ? 'Respond to the request above to start messaging…'
                    : (connStatus === 'pending_out'
                        ? 'Waiting for acceptance…'
                        : 'Not connected yet — you can still type.'))
            }
            style={{ flex:1, resize:'none', minHeight:42, maxHeight:120 }}
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!text.trim() || connStatus !== 'accepted'}
            title={connStatus === 'accepted' ? 'Send' : 'You must be connected to send'}
          >
            Send
          </button>
        </form>
      ) : (
        <div className="muted" style={{ padding:12, borderTop:'1px solid var(--border)' }}>
          {me?.id ? 'Select a person to start chatting.' : 'Sign in to send messages.'}
        </div>
      )}
    </div>
  )
}
















