// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock (full, RPC send + Disconnect)
 * - Connection flow: none → Connect → pending_in|pending_out → accepted → (Disconnect) → none
 * - Composer visible; Send disabled until 'accepted'
 * - Send text + images/files via RPC public.send_message (security definer)
 * - Typing indicator, pagination, delete own, report, mark read
 * - Header buttons colorized: ✓ teal, Report amber, ✕ coral, Disconnect slate
 */

const PAGE_SIZE = 50
const REPORT_CATEGORIES = ['spam', 'harassment', 'fake', 'scam', 'other']
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILE_SIZE  = 25 * 1024 * 1024 // 25MB

function isImage(mime) {
  return typeof mime === 'string' && mime.startsWith('image/')
}

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
  if (error) alert(error.message || 'Failed to submit report')
  else alert('Report submitted. Thank you for helping keep the community safe.')
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
  const [menuOpenFor, setMenuOpenFor] = useState(null)
  // none | pending_in | pending_out | accepted | unknown
  const [connStatus, setConnStatus] = useState('unknown')

  const listRef = useRef(null)
  const typingTimerRef = useRef(null)
  const nearBottomRef = useRef(true)
  const oldestTsRef = useRef(null)
  const lastScrollHeightRef = useRef(0)
  const prevSnapshotRef = useRef([])

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
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
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

  // ---- Upload helpers ----
  async function uploadToStorage(file) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const path = `${me.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('chat-uploads')
      .upload(path, file, { upsert: false, contentType: file.type })
    if (upErr) throw upErr
    const { data: pub } = supabase.storage.from('chat-uploads').getPublicUrl(path)
    return { url: pub?.publicUrl, path }
  }

  async function sendAttachmentMessage({ file, kind }) {
    if (!partnerId) return
    if (kind === 'image' && file.size > MAX_IMAGE_SIZE) {
      alert('Image too large. Max 10MB.')
      return
    }
    if (kind === 'file' && file.size > MAX_FILE_SIZE) {
      alert('File too large. Max 25MB.')
      return
    }
    if (connStatus !== 'accepted') {
      alert('You need to accept the connection before sending. Use the Accept button above.')
      return
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic = {
      id: tempId,
      sender: me.id,
      recipient: partnerId,
      body: '',
      created_at: new Date().toISOString(),
      read_at: null,
      kind,
      media_url: 'uploading...',
      media_name: file.name,
      media_mime: file.type,
      media_size: file.size,
      _status: 'sending'
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const { url } = await uploadToStorage(file)
      const { data, error } = await supabase.rpc('send_message', {
        p_recipient: partnerId,
        p_body: '',
        p_kind: kind, // 'image' or 'file'
        p_media_url: url,
        p_media_name: file.name,
        p_media_mime: file.type,
        p_media_size: file.size
      })
      if (error || !data) {
        console.error('Attachment send error:', error)
        if (error?.message) alert(`Upload message failed: ${error.message}`)
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed' } : m))
      } else {
        const row = Array.isArray(data) ? data[0] : data
        setMessages(prev => prev.map(m => m.id === tempId ? { ...row } : m))
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed' } : m))
      alert(err.message || 'Upload failed')
    } finally {
      setTimeout(() => { if (nearBottomRef.current) scrollToBottom() }, 0)
    }
  }
  function onPickImage(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const kind = isImage(f.type) ? 'image' : 'file'
    sendAttachmentMessage({ file: f, kind })
    e.target.value = ''
  }
  function onPickFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const kind = isImage(f.type) ? 'image' : 'file'
    sendAttachmentMessage({ file: f, kind })
    e.target.value = ''
  }

  // ---- Load latest (initial) ----
  const loadInitial = useCallback(async () => {
    if (!me?.id || !partnerId) {
      setMessages([]); setHasMore(false); setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, recipient, body, created_at, read_at, kind, media_url, media_name, media_mime, media_size')
      .or(
        `and(sender.eq.${me.id},recipient.eq.${partnerId}),and(sender.eq.${partnerId},recipient.eq.${me.id})`
      )
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) {
      setMessages([]); setHasMore(false); setLoading(false)
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
  }, [me?.id, partnerId])

  // ---- Load older (pagination) ----
  const loadOlder = useCallback(async () => {
    if (!oldestTsRef.current) return
    setLoadingOlder(true)
    lastScrollHeightRef.current = listRef.current?.scrollHeight || 0

    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, recipient, body, created_at, read_at, kind, media_url, media_name, media_mime, media_size')
      .or(
        `and(sender.eq.${me.id},recipient.eq.${partnerId}),and(sender.eq.${partnerId},recipient.eq.${me.id})`
      )
      .lt('created_at', oldestTsRef.current)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) { setLoadingOlder(false); return }

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
  useEffect(() => { loadInitial() }, [loadInitial])

  // ---- Connection status (fetch newest row) ----
  useEffect(() => {
    let cancel = false
    async function loadConn() {
      if (!me?.id || !partnerId) { setConnStatus('none'); return }
      const { data, error } = await supabase
        .from('connection_requests')
        .select('requester, recipient, status, decided_at, created_at')
        .or(`and(requester.eq.${me.id},recipient.eq.${partnerId}),and(requester.eq.${partnerId},recipient.eq.${me.id})`)
        .order('decided_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
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

  // ---- Realtime connection changes ----
  useEffect(() => {
    if (!me?.id || !partnerId) return
    const ch = supabase
      .channel(`conn-${me.id}-${partnerId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'connection_requests' },
        payload => {
          const r = payload?.new
          if (!r) return
          const pair =
            (r.requester === me.id && r.recipient === partnerId) ||
            (r.requester === partnerId && r.recipient === me.id)
          if (!pair) return
          if (r.status === 'pending') {
            if (r.requester === me.id) setConnStatus('pending_out')
            else if (r.recipient === me.id) setConnStatus('pending_in')
          }
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'connection_requests' },
        payload => {
          const r = payload?.new
          if (!r) return
          const pair =
            (r.requester === me.id && r.recipient === partnerId) ||
            (r.requester === partnerId && r.recipient === me.id)
          if (!pair) return
          if (r.status === 'accepted') setConnStatus('accepted')
          else if (r.status === 'rejected') setConnStatus('none')
          else if (r.status === 'pending') {
            if (r.requester === me.id) setConnStatus('pending_out')
            else if (r.recipient === me.id) setConnStatus('pending_in')
          } else if (r.status === 'disconnected') {
            setConnStatus('none')
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [me?.id, partnerId])

  // ---- Realtime messages ----
  useEffect(() => {
    const ch = supabase
      .channel(`msg-${me?.id}-${partnerId}`)
      .on('postgres_changes',
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
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => onUnreadChange && onUnreadChange())
      .on('postgres_changes',
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
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [me?.id, partnerId])

  // ---- Typing indicator ----
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
      setMenuOpenFor(null)
      trackScrollNearBottom()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // ---- Send (TEXT) via RPC ----
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
      kind: 'text',
      media_url: null,
      media_name: null,
      media_mime: null,
      media_size: null,
      _status: 'sending'
    }
    setMessages(prev => {
      const next = [...prev, optimistic]
      prevSnapshotRef.current = next
      return next
    })
    setText('')
    setTimeout(scrollToBottom, 0)

    const { data, error } = await supabase.rpc('send_message', {
      p_recipient: partnerId,
      p_body: body,
      p_kind: 'text',
      p_media_url: null,
      p_media_name: null,
      p_media_mime: null,
      p_media_size: null
    })

    if (error || !data) {
      console.error('Send error:', error)
      if (error?.message) alert(`Send failed: ${error.message}`)
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed' } : m))
    } else {
      const row = Array.isArray(data) ? data[0] : data
      setMessages(prev => prev.map(m => m.id === tempId ? { ...row } : m))
    }
  }

  // ---- Retry send (TEXT/ATTACHMENT) via RPC ----
  async function retrySend(failedMsg) {
    if (!partnerId) return
    if (connStatus !== 'accepted') {
      alert('You need to accept the connection before sending. Use the Accept button above.')
      return
    }
    setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, _status: 'sending' } : m))

    const { data, error } = await supabase.rpc('send_message', {
      p_recipient: partnerId,
      p_body: failedMsg.body || '',
      p_kind: failedMsg.kind || 'text',
      p_media_url: failedMsg.media_url || null,
      p_media_name: failedMsg.media_name || null,
      p_media_mime: failedMsg.media_mime || null,
      p_media_size: failedMsg.media_size || null
    })

    if (error || !data) {
      console.error('Retry send error:', error)
      if (error?.message) alert(`Send failed: ${error.message}`)
      setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, _status: 'failed' } : m))
    } else {
      const row = Array.isArray(data) ? data[0] : data
      setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...row } : m))
    }
  }

  // ---- Delete own message ----
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

  // ---- Accept / Reject / Request / Disconnect ----
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
      .eq('status', 'pending')
    if (error) return alert(error.message)
    setConnStatus('none')
  }
  async function requestConnection() {
    if (!me?.id || !partnerId) return
    const { error } = await supabase
      .from('connection_requests')
      .insert({
        requester: me.id,
        recipient: partnerId,
        status: 'pending',
        created_at: new Date().toISOString()
      })
    if (error && error.code !== '23505') alert(error.message)
    else setConnStatus('pending_out')
  }
  async function disconnectConnection() {
    // Either party can turn latest accepted row to 'disconnected' (RLS policy required)
    const { error } = await supabase
      .from('connection_requests')
      .update({ status: 'disconnected', decided_at: new Date().toISOString() })
      .or(`and(requester.eq.${me.id},recipient.eq.${partnerId}),and(requester.eq.${partnerId},recipient.eq.${me.id})`)
      .eq('status', 'accepted')
    if (error) return alert(error.message)
    setConnStatus('none')
    alert('Disconnected. You can reconnect later with a new request.')
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
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
          {connStatus === 'none' && partnerId && (
            <button
              className="btn"
              onClick={requestConnection}
              title="Send connection request"
              style={{
                background:'#0f766e', color:'#fff', border:'1px solid #0f766e',
                padding:'6px 10px', borderRadius:8, fontWeight:700
              }}
            >
              Connect
            </button>
          )}

          {connStatus === 'accepted' && (
            <button
              className="btn"
              onClick={disconnectConnection}
              title="Disconnect"
              aria-label="Disconnect"
              style={{
                background:'#64748b', color:'#fff', border:'1px solid #475569',
                padding:'6px 10px', borderRadius:8, fontWeight:700
              }}
            >
              Disconnect
            </button>
          )}

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
      <div ref={listRef} style={{ padding:12, overflowY:'auto', maxHeight: 420 }}>
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
              const showPartnerMenu = !mine

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
                    {/* content */}
                    {m.kind === 'image' && m.media_url ? (
                      <a href={m.media_url} target="_blank" rel="noreferrer" title={m.media_name} style={{ display:'inline-block' }}>
                        <img
                          src={m.media_url}
                          alt={m.media_name || 'image'}
                          style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }}
                          onLoad={() => setTimeout(() => { if (nearBottomRef.current) scrollToBottom() }, 0)}
                        />
                      </a>
                    ) : m.kind === 'file' && m.media_url ? (
                      <a href={m.media_url} target="_blank" rel="noreferrer" className="btn btn-neutral" style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                        📎 {m.media_name || 'download'} ({m.media_mime || 'file'})
                      </a>
                    ) : (
                      <div style={{ whiteSpace:'pre-wrap' }}>{m.body}</div>
                    )}

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

      {/* composer */}
      {(!!me?.id && partnerId) ? (
        <form onSubmit={send} style={{ display:'flex', gap:8, padding:12, borderTop:'1px solid var(--border)', alignItems:'center' }}>
          {/* hidden inputs */}
          <input type="file" accept="image/*" onChange={onPickImage} style={{ display:'none' }} id="pick-image" />
          <input type="file" onChange={onPickFile} style={{ display:'none' }} id="pick-file" />

          {/* attach controls */}
          <div style={{ display:'flex', gap:6 }}>
            <label htmlFor="pick-image" className="btn btn-neutral" title="Send image">🖼️</label>
            <label htmlFor="pick-file" className="btn btn-neutral" title="Send file">📎</label>
          </div>

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

















