// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock (paginated + safety)
 * - Typing indicator (broadcast)
 * - Send status (sending/failed + retry)
 * - Auto-mark read on open + new incoming
 * - Delete own messages (with confirm)
 * - Report partner (header + ⋯ on partner messages)
 * - Pagination: loads latest 50, "Load older" for history
 * - Enter to send, Shift+Enter newline, Esc close
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

  const listRef = useRef(null)
  const inputRef = useRef(null)
  const typingTimerRef = useRef(null)
  const nearBottomRef = useRef(true) // track if user is scrolled near bottom for auto-scroll

  const oldestTsRef = useRef(null)
  const lastScrollHeightRef = useRef(0)
  const prevSnapshotRef = useRef([])

  const threadKey = useMemo(() => {
    const a = String(me.id)
    const b = String(partnerId)
    return a < b ? `${a}-${b}` : `${b}-${a}`
  }, [me.id, partnerId])

  const title = useMemo(() => partnerName || 'Conversation', [partnerName])
  const canType = !!me?.id

  function isInThisThread(m) {
    return (
      (m.sender === me.id && m.receiver === partnerId) ||
      (m.sender === partnerId && m.receiver === me.id)
    )
  }

  function trackScrollNearBottom() {
    if (!listRef.current) return
    const el = listRef.current
    const threshold = 60
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  function scrollToBottom() {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }

  function restoreScrollAfterPrepend() {
    const el = listRef.current
    if (!el) return
    const delta = el.scrollHeight - lastScrollHeightRef.current
    el.scrollTop = el.scrollTop + delta
  }

  // ---- Load latest messages (initial) ----
  const loadInitial = useCallback(async () => {
    // ⛑️ Guard: skip if IDs are missing
    if (!me?.id || !partnerId) {
      setMessages([])
      setHasMore(false)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, receiver, body, created_at, read_at')
      .or(
        `and(sender.eq.${me.id},receiver.eq.${partnerId}),and(sender.eq.${partnerId},receiver.eq.${me.id})`
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

    markThreadRead()
    setTimeout(scrollToBottom, 0)
  }, [me.id, partnerId])

  // ---- Load older (pagination) ----
  const loadOlder = useCallback(async () => {
    if (!oldestTsRef.current) return
    setLoadingOlder(true)
    lastScrollHeightRef.current = listRef.current?.scrollHeight || 0

    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, receiver, body, created_at, read_at')
      .or(
        `and(sender.eq.${me.id},receiver.eq.${partnerId}),and(sender.eq.${partnerId},receiver.eq.${me.id})`
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
  }, [me.id, partnerId])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  // ---- Realtime ----
  useEffect(() => {
    const ch = supabase
      .channel(`msg-${me.id}-${partnerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new
        if (!isInThisThread(m)) return
        setMessages(prev => {
          const next = [...prev, m]
          prevSnapshotRef.current = next
          return next
        })
        if (m.receiver === me.id && !m.read_at) markThreadRead()
        onUnreadChange && onUnreadChange()
        if (nearBottomRef.current) setTimeout(scrollToBottom, 0)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () =>
        onUnreadChange && onUnreadChange()
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
        const deletedId = payload.old?.id
        if (!deletedId) return
        setMessages(prev => {
          const next = prev.filter(m => m.id !== deletedId)
          prevSnapshotRef.current = next
          return next
        })
        onUnreadChange && onUnreadChange()
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [me.id, partnerId])

  // ---- Typing indicator ----
  useEffect(() => {
    const typingChannel = supabase.channel(`typing:${threadKey}`)
    typingChannel
      .on('broadcast', { event: 'typing' }, payload => {
        const from = payload?.payload?.from
        if (from && from !== me.id) {
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
  }, [threadKey, me.id])

  function broadcastTyping() {
    supabase.channel(`typing:${threadKey}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { from: me.id, at: Date.now() }
    })
  }

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = () => {
      setMenuOpenFor(null)
      trackScrollNearBottom()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // ---- Send ----
  async function send(e) {
    e?.preventDefault?.()
    const body = text.trim()
    if (!body || !partnerId) return // guard

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
    setMessages(prev => {
      const next = [...prev, optimistic]
      prevSnapshotRef.current = next
      return next
    })
    setText('')
    setTimeout(scrollToBottom, 0)

    const { data, error } = await supabase
      .from('messages')
      .insert({ sender: me.id, receiver: partnerId, body })
      .select('id, sender, receiver, body, created_at, read_at')
      .single()

    if (error || !data) {
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, _status: 'failed' } : m)))
    } else {
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...data } : m)))
    }
  }

  async function retrySend(failedMsg) {
    if (!partnerId) return
    setMessages(prev => prev.map(m => (m.id === failedMsg.id ? { ...m, _status: 'sending' } : m)))
    const { data, error } = await supabase
      .from('messages')
      .insert({ sender: me.id, receiver: partnerId, body: failedMsg.body })
      .select('id, sender, receiver, body, created_at, read_at')
      .single()
    if (error || !data) {
      setMessages(prev => prev.map(m => (m.id === failedMsg.id ? { ...m, _status: 'failed' } : m)))
    } else {
      setMessages(prev => prev.map(m => (m.id === failedMsg.id ? { ...data } : m)))
    }
  }

  async function deleteMessage(id) {
    setMenuOpenFor(null)
    if (!id) return
    const yes = window.confirm('Delete this message for everyone? This cannot be undone.')
    if (!yes) return
    const snapshot = prevSnapshotRef.current
    setMessages(prev => prev.filter(m => m.id !== id))
    const { error } = await supabase.from('messages').delete().eq('id', id)
    if (error) {
      setMessages(snapshot)
      alert(error.message || 'Failed to delete message')
    }
  }

  async function markThreadRead() {
    if (!me?.id || !partnerId) return
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .eq('receiver', me.id)
      .eq('sender', partnerId)
    onUnreadChange && onUnreadChange()
  }

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
        position: 'fixed',
        right: 16,
        bottom: 80,
        width: 360,
        maxWidth: 'calc(100vw - 24px)',
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
        zIndex: 1002,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
      onClick={() => setMenuOpenFor(null)}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-neutral" onClick={markThreadRead} title="Mark read">
            ✓
          </button>
          {partnerId && (
            <button
              className="btn btn-neutral"
              onClick={() => reportUser({ reporterId: me.id, reportedId: partnerId })}
              title="Report this user"
            >
              Report
            </button>
          )}
          <button className="btn btn-neutral" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>

      {/* list */}
      <div ref={listRef} style={{ padding: 12, overflowY: 'auto', maxHeight: 420 }}>
        {loading && <div className="muted">Loading…</div>}

        {!loading && (
          <>
            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
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

            {(!partnerId) ? (
              <div className="muted">Pick someone to start a conversation.</div>
            ) : messages.length === 0 ? (
              <div className="muted">No messages yet. Say hi 👋</div>
            ) : null}

            {messages.map(m => {
              const mine = m.sender === me.id
              const failed = m._status === 'failed'
              const sending = m._status === 'sending'
              const showMenuMine = mine && !sending && !failed
              const showPartnerMenu = !mine

              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    justifyContent: mine ? 'flex-end' : 'flex-start',
                    marginBottom: 8,
                    position: 'relative'
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '8px 10px',
                      borderRadius: 12,
                      background: mine ? '#0f766e' : '#f8fafc',
                      color: mine ? '#fff' : '#0f172a',
                      border: mine ? 'none' : '1px solid var(--border)'
                    }}
                    onMouseLeave={() => setMenuOpenFor(null)}
                  >
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    <div
                      className="muted"
                      style={{
                        fontSize: 11,
                        marginTop: 4,
                        display: 'flex',
                        gap: 8,
                        justifyContent: mine ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                      {mine && sending && <span>· sending…</span>}
                      {mine && failed && (
                        <>
                          <span style={{ color: '#ef4444' }}>· failed</span>
                          <button
                            type="button"
                            className="btn btn-neutral"
                            style={{ padding: '0 6px', fontSize: 11 }}
                            onClick={() => retrySend(m)}
                          >
                            retry
                          </button>
                        </>
                      )}
                      {!mine && m.read_at && <span>· read</span>}
                    </div>

                    {(showMenuMine || showPartnerMenu) && (
                      <button
                        type="button"
                        className="btn btn-neutral"
                        onClick={e => {
                          e.stopPropagation()
                          setMenuOpenFor(menuOpenFor === m.id ? null : m.id)
                        }}
                        title="More"
                        style={{
                          position: 'absolute',
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

                    {menuOpenFor === m.id && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 18,
                          right: mine ? -6 : 'auto',
                          left: mine ? 'auto' : -6,
                          background: '#fff',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          boxShadow: '0 8px 18px rgba(0,0,0,0.12)',
                          padding: 6,
                          zIndex: 5
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        {mine ? (
                          <button











