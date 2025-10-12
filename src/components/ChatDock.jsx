// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock (RPC-driven)
 * - Uses SECURITY DEFINER RPCs: get_connection_state, request_or_accept, accept_request, reject_request
 * - Shows Accept/Reject/Connect in header + banner + inline in first partner bubble
 * - Buttons are type="button" and stop event bubbling; busy state prevents double clicks
 * - Polls connection state every 4s until accepted
 * - Supports text + image/file uploads via Supabase Storage (bucket: chat-uploads)
 */

const PAGE_SIZE = 50
const REPORT_CATEGORIES = ['spam', 'harassment', 'fake', 'scam', 'other']
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

function isImage(mime) {
  return typeof mime === 'string' && mime.startsWith('image/')
}

async function reportUser({ reporterId, reportedId }) {
  const categoryRaw = window.prompt(
    `Reason? Choose one:
${REPORT_CATEGORIES.join(', ')}`,
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

  // connection state
  const [connStatus, setConnStatus] = useState('unknown') // none | pending_in | pending_out | accepted | unknown
  const [incomingReqId, setIncomingReqId] = useState(null)
  const [lastConnError, setLastConnError] = useState(null)
  const [actionBusy, setActionBusy] = useState(null) // 'accept' | 'reject' | 'connect' | 'disconnect'

  const listRef = useRef(null)
  const typingTimerRef = useRef(null)
  const nearBottomRef = useRef(true)
  const oldestTsRef = useRef(null)
  const lastScrollHeightRef = useRef(0)
  const prevSnapshotRef = useRef([])
  const pollTimerRef = useRef(null)

  const threadKey = useMemo(() => {
    const a = String(me?.id || '')
    const b = String(partnerId || '')
    return a < b ? `${a}-${b}` : `${b}-${a}`
  }, [me?.id, partnerId])

  const title = useMemo(() => partnerName || 'Conversation', [partnerName])

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

  // ---- Message de-dupe + reconciliation helpers ----
  function mergeIncomingMessage(newMsg, tempMatchHint) {
    if (!newMsg) return
    setMessages(prev => {
      // If the server row is already present, do nothing
      if (newMsg.id && prev.some(x => x.id === newMsg.id)) {
        return prev
      }
      // Try to find an optimistic temp we can replace
      let idx = -1
      if (tempMatchHint?.tempId) {
        idx = prev.findIndex(x => x.id === tempMatchHint.tempId)
      }
      if (idx === -1) {
        idx = prev.findIndex(x =>
          String(x.id).startsWith('temp-') &&
          x.sender === newMsg.sender &&
          x.recipient === newMsg.recipient &&
          x.kind === (newMsg.kind || 'text') &&
          (x.body || '') === (newMsg.body || '') &&
          (
            (newMsg.media_url && x.media_url === 'uploading...') ||
            (!newMsg.media_url)
          )
        )
      }
      if (idx !== -1) {
        const next = prev.slice()
        next[idx] = newMsg
        prevSnapshotRef.current = next
        return next
      }
      const next = [...prev, newMsg]
      prevSnapshotRef.current = next
      return next
    })
  }

  function reconcileAfterRpc(tempId, persistedRow) {
    if (!persistedRow) return
    setMessages(prev => {
      // If realtime already inserted the persisted row, drop the temp
      if (prev.some(x => x.id === persistedRow.id)) {
        const next = prev.filter(x => x.id !== tempId)
        prevSnapshotRef.current = next
        return next
      }
      // Otherwise, replace the temp with the real row
      const idx = prev.findIndex(x => x.id === tempId)
      if (idx !== -1) {
        const next = prev.slice()
        next[idx] = persistedRow
        prevSnapshotRef.current = next
        return next
      }
      // Fallback: append (should be rare)
      const next = [...prev, persistedRow]
      prevSnapshotRef.current = next
      return next
    })
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
    if (kind === 'image' && file.size > MAX_IMAGE_SIZE) { alert('Image too large. Max 10MB.'); return }
    if (kind === 'file' && file.size > MAX_FILE_SIZE) { alert('File too large. Max 25MB.'); return }
    if (connStatus !== 'accepted') { alert('You need to accept the connection before sending.'); return }

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
        p_kind: kind,
        p_media_url: url,
        p_media_name: file.name,
        p_media_mime: file.type,
        p_media_size: file.size
      })
      if (error || !data) {
        console.error('Attachment send error:', error)
        if (error?.message) alert(`Upload message failed: ${error.message}`)
        setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, _status: 'failed' } : m)))
      } else {
        const row = Array.isArray(data) ? data[0] : data
        reconcileAfterRpc(tempId, row)
      }
    } catch (err) {
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, _status: 'failed' } : m)))
      alert(err.message || 'Upload failed')
    } finally {
      setTimeout(() => { if (nearBottomRef.current) scrollToBottom() }, 0)
    }
  }
  function onPickImage(e) {
    const f = e.target.files?.[0]; if (!f) return
    const kind = isImage(f.type) ? 'image' : 'file'
    sendAttachmentMessage({ file: f, kind })
    e.target.value = ''
  }
  function onPickFile(e) {
    const f = e.target.files?.[0]; if (!f) return
    const kind = isImage(f.type) ? 'image' : 'file'
    sendAttachmentMessage({ file: f, kind })
    e.target.value = ''
  }

  // ---- Load latest (initial) ----
  const loadInitial = useCallback(async () => {
    if (!me?.id || !partnerId) { setMessages([]); setHasMore(false); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender, recipient, body, created_at, read_at, kind, media_url, media_name, media_mime, media_size')
      .or(`and(sender.eq.${me.id},recipient.eq.${partnerId}),and(sender.eq.${partnerId},recipient.eq.${me.id})`)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) { setMessages([]); setHasMore(false); setLoading(false); return }
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
      .or(`and(sender.eq.${me.id},recipient.eq.${partnerId}),and(sender.eq.${partnerId},recipient.eq.${me.id})`)
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

  useEffect(() => { loadInitial() }, [loadInitial])

  // ---- Connection status (RPC) + POLL ----
  const fetchConnState = useCallback(async () => {
    if (!me?.id || !partnerId) { setConnStatus('none'); setIncomingReqId(null); return }
    try {
      const { data, error } = await supabase.rpc('get_connection_state', { p_me: me.id, p_partner: partnerId })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      const nextStatus = row?.conn_status || 'none'
      setConnStatus(nextStatus)
      setIncomingReqId(row?.incoming_id || null)
      setLastConnError(null)
    } catch (err) {
      console.warn('get_connection_state failed; showing decision UI anyway', err)
      setLastConnError(err?.message || String(err))
    }
  }, [me?.id, partnerId])

  useEffect(() => {
    fetchConnState()
    window.clearInterval(pollTimerRef.current)
    pollTimerRef.current = window.setInterval(() => {
      if (connStatus !== 'accepted') fetchConnState()
    }, 4000)
    return () => window.clearInterval(pollTimerRef.current)
  }, [fetchConnState, connStatus])

  // ---- Realtime messages ----
  useEffect(() => {
    const ch = supabase
      .channel(`msg-${me?.id}-${partnerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new
        if (!isInThisThread(m)) return
        mergeIncomingMessage(m)
        if (m.recipient === me?.id && !m.read_at) markThreadRead()
        onUnreadChange && onUnreadChange()
        if (nearBottomRef.current) setTimeout(scrollToBottom, 0)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => onUnreadChange && onUnreadChange())
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
    supabase.channel(`typing:${threadKey}`).send({ type: 'broadcast', event: 'typing', payload: { from: me?.id, at: Date.now() } })
  }

  // ---- Scroll tracking ----
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = () => { setMenuOpenFor(null); trackScrollNearBottom() }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // ---- Send (TEXT) via RPC ----
  async function send(e) {
    e?.preventDefault?.()
    const body = text.trim()
    if (!body || !partnerId) return
    if (connStatus !== 'accepted') { alert('You need to accept the connection before sending.'); return }

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
    setMessages(prev => { const next = [...prev, optimistic]; prevSnapshotRef.current = next; return next })
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
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, _status: 'failed' } : m)))
    } else {
      const row = Array.isArray(data) ? data[0] : data
      reconcileAfterRpc(tempId, row)
    }
  }

  // ---- Retry send via RPC ----
  async function retrySend(failedMsg) {
    if (!partnerId) return
    if (connStatus !== 'accepted') { alert('You need to accept the connection before sending.'); return }

    setMessages(prev => prev.map(m => (m.id === failedMsg.id ? { ...m, _status: 'sending' } : m)))

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
      setMessages(prev => prev.map(m => (m.id === failedMsg.id ? { ...m, _status: 'failed' } : m)))
    } else {
      const row = Array.isArray(data) ? data[0] : data
      reconcileAfterRpc(failedMsg.id, row)
    }
  }

  // ---- Connection actions (RPCs + busy + stopPropagation) ----
  async function acceptConnection(e) {
    e?.preventDefault?.(); e?.stopPropagation?.()
    if (actionBusy) return
    if (!me?.id || !partnerId) return
    try {
      setActionBusy('accept')
      const { error } = await supabase.rpc('accept_request', { p_me: me.id, p_partner: partnerId })
      if (error) throw error
      await fetchConnState()
    } catch (err) {
      console.error('accept_request failed', err)
      alert(err.message || 'Accept failed')
    } finally {
      setActionBusy(null)
    }
  }

  async function rejectConnection(e) {
    e?.preventDefault?.(); e?.stopPropagation?.()
    if (actionBusy) return
    try {
      setActionBusy('reject')
      const { error: rpcErr } = await supabase.rpc('reject_request', { p_me: me?.id, p_partner: partnerId })
      if (rpcErr) {
        const { error } = await supabase
          .from('connection_requests')
          .update({ status: 'rejected', decided_at: new Date().toISOString() })
          .eq('recipient', me?.id)
          .eq('requester', partnerId)
          .eq('status', 'pending')
        if (error) throw error
      }
      await fetchConnState()
    } catch (err) {
      console.error('reject failed', err)
      alert(err.message || 'Reject failed')
    } finally {
      setActionBusy(null)
    }
  }

  async function requestConnection(e) {
    e?.preventDefault?.(); e?.stopPropagation?.()
    if (actionBusy) return
    if (!me?.id || !partnerId) return
    try {
      setActionBusy('connect')
      const { error } = await supabase.rpc('request_or_accept', { p_me: me.id, p_partner: partnerId })
      if (error) throw error
      await fetchConnState()
    } catch (err) {
      console.error('request_or_accept failed', err)
      alert(err.message || 'Connect failed')
    } finally {
      setActionBusy(null)
    }
  }

  async function disconnectConnection(e) {
    e?.preventDefault?.(); e?.stopPropagation?.()
    if (actionBusy) return
    try {
      setActionBusy('disconnect')
      const { error } = await supabase
        .from('connection_requests')
        .update({ status: 'disconnected', decided_at: new Date().toISOString() })
        .or(`and(requester.eq.${me.id},recipient.eq.${partnerId}),and(requester.eq.${partnerId},recipient.eq.${me.id})`)
        .eq('status', 'accepted')
      if (error) throw error
      await fetchConnState()
      alert('Disconnected. You can reconnect later with a new request.')
    } catch (err) {
      console.error('disconnect failed', err)
      alert(err.message || 'Disconnect failed')
    } finally {
      setActionBusy(null)
    }
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
    if (e.key === 'Escape') { e.preventDefault(); onClose && onClose(); return }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return }
  }
  function onInputChange(e) {
    setText(e.target.value)
    if (!typingTimerRef.current) {
      broadcastTyping()
      typingTimerRef.current = window.setTimeout(() => { typingTimerRef.current = null }, 800)
    }
  }

  // ===== Inline Accept/Reject placement logic =====
  const firstPartnerIndex = useMemo(() => {
    if (!Array.isArray(messages) || !partnerId) return -1
    return messages.findIndex(m => m.sender === partnerId)
  }, [messages, partnerId])

  const showAnyDecisionUI = connStatus === 'pending_in' || (!!lastConnError && partnerId) || connStatus === 'pending_out'

  // ---- UI ----
  const busyLabel = (k) => (actionBusy === k ? '…' : undefined)
  const isBusy = !!actionBusy

  return (
    <div
      style={{
        position: 'fixed', right: 16, bottom: 80,
        width: 360, maxWidth: 'calc(100vw - 24px)',
        background: '#fff', border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 1002,
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}
      onClick={() => setMenuOpenFor(null)}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(connStatus === 'none' || connStatus === 'pending_out') && partnerId && (
            <button type="button" className="btn" onClick={requestConnection} onMouseDown={(e) => e.stopPropagation()} title="Connect or accept reverse request" disabled={isBusy}
              style={{ opacity: isBusy ? 0.7 : 1, background: '#0f766e', color: '#fff', border: '1px solid #0f766e', padding: '6px 10px', borderRadius: 8, fontWeight: 700 }}>
              {busyLabel('connect') || (connStatus === 'pending_out' ? 'Resend / Accept' : 'Connect')}
            </button>
          )}

          {connStatus === 'accepted' && (
            <button type="button" className="btn" onClick={disconnectConnection} onMouseDown={(e) => e.stopPropagation()} title="Disconnect" disabled={isBusy}
              style={{ opacity: isBusy ? 0.7 : 1, background: '#64748b', color: '#fff', border: '1px solid #475569', padding: '6px 10px', borderRadius: 8, fontWeight: 700 }}>
              {busyLabel('disconnect') || 'Disconnect'}
            </button>
          )}

          {partnerId && connStatus !== 'accepted' && (
            <button type="button" className="btn" onClick={acceptConnection} onMouseDown={(e) => e.stopPropagation()} title="Accept (works even if UI shows pending_out)" disabled={isBusy}
              style={{ opacity: isBusy ? 0.7 : 1, background: '#059669', color: '#fff', border: '1px solid #047857', padding: '6px 10px', borderRadius: 8, fontWeight: 700 }}>
              {busyLabel('accept') || 'Accept'}
            </button>
          )}

          {partnerId && connStatus !== 'accepted' && (
            <button type="button" className="btn" onClick={rejectConnection} onMouseDown={(e) => e.stopPropagation()} title="Reject pending (if exists)" disabled={isBusy}
              style={{ opacity: isBusy ? 0.7 : 1, background: '#f43f5e', color: '#fff', border: '1px solid #e11d48', padding: '6px 10px', borderRadius: 8, fontWeight: 700 }}>
              {busyLabel('reject') || 'Reject'}
            </button>
          )}{partnerId && (
            <button type="button" className="btn" onClick={() => reportUser({ reporterId: me.id, reportedId: partnerId })} title="Report this user"
              style={{ background: '#f59e0b', color: '#111827', border: '1px solid #d97706', padding: '6px 10px', borderRadius: 8, fontWeight: 700 }}>
              Report
            </button>
          )}

          <button type="button" className="btn" onClick={onClose} title="Close"
            style={{ background: '#f43f5e', color: '#fff', border: '1px solid #e11d48', padding: '6px 10px', borderRadius: 8, fontWeight: 700 }}>
            ✕
          </button>
        </div>
      </div>

      {/* connection status banner */}
      {partnerId && connStatus !== 'accepted' && (
        <div style={{ padding: 10, background: '#fff7ed', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {connStatus === 'pending_in' ? 'This person wants to connect with you.'
              : connStatus === 'pending_out' ? 'Request sent — you can still Accept if they already requested you.'
              : 'Not connected yet — Connect or Accept if a request exists.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={rejectConnection} onMouseDown={(e) => e.stopPropagation()} disabled={isBusy}
              style={{ opacity: isBusy ? 0.7 : 1, background: '#f43f5e', color: '#fff', border: '1px solid #e11d48', padding: '6px 10px', borderRadius: 8, fontWeight: 700 }}>
              {busyLabel('reject') || 'Reject'}
            </button>
            <button type="button" className="btn" onClick={acceptConnection} onMouseDown={(e) => e.stopPropagation()} disabled={isBusy}
              style={{ opacity: isBusy ? 0.7 : 1, background: '#0f766e', color: '#fff', border: '1px solid #0f766e', padding: '6px 10px', borderRadius: 8, fontWeight: 700 }}>
              {busyLabel('accept') || 'Accept'}
            </button>
            <button type="button" className="btn" onClick={requestConnection} onMouseDown={(e) => e.stopPropagation()} disabled={isBusy}
              style={{ opacity: isBusy ? 0.7 : 1, background: '#0ea5e9', color: '#fff', border: '1px solid #0284c7', padding: '6px 10px', borderRadius: 8, fontWeight: 700 }}>
              {busyLabel('connect') || 'Connect'}
            </button>
          </div>
          {lastConnError && (
            <div className="muted" style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>
              (State fallback active: {String(lastConnError)})
            </div>
          )}
        </div>
      )}

      {/* list */}
      <div ref={listRef} style={{ padding: 12, overflowY: 'auto', maxHeight: 420 }}>
        {loading && <div className="muted">Loading…</div>}

        {!loading && (
          <>
            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <button type="button" className="btn btn-neutral" disabled={loadingOlder} onClick={loadOlder} title="Load older messages">
                  {loadingOlder ? 'Loading…' : 'Load older'}
                </button>
              </div>
            )}

            {!partnerId && <div className="muted">Select a person to start chatting.</div>}
            {partnerId && messages.length === 0 && <div className="muted">Say hi 👋</div>}

            {partnerId && messages.map((m, idx) => {
              const mine = m.sender === me?.id
              const failed = m._status === 'failed'
              const sending = m._status === 'sending'
              const showMenuMine = mine && !sending && !failed
              const showPartnerMenu = !mine
              const showInlineDecision = showAnyDecisionUI && idx === firstPartnerIndex && m.sender === partnerId

              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 8, position: 'relative' }}>
                  <div
                    style={{ maxWidth: '78%', padding: '8px 10px', borderRadius: 12, background: mine ? '#0f766e' : '#f8fafc', color: mine ? '#fff' : '#0f172a', border: mine ? 'none' : '1px solid var(--border)' }}
                    onMouseLeave={() => setMenuOpenFor(null)}
                  >
                    {m.kind === 'image' && m.media_url ? (
                      <a href={m.media_url} target="_blank" rel="noreferrer" title={m.media_name} style={{ display: 'inline-block' }}>
                        <img src={m.media_url} alt={m.media_name || 'image'} style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }}
                          onLoad={() => setTimeout(() => { if (nearBottomRef.current) scrollToBottom() }, 0)} />
                      </a>
                    ) : m.kind === 'file' && m.media_url ? (
                      <a href={m.media_url} target="_blank" rel="noreferrer" className="btn btn-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        📎 {m.media_name || 'download'} ({m.media_mime || 'file'})
                      </a>
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    )}

                    {showInlineDecision && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button type="button" className="btn" onClick={rejectConnection} onMouseDown={(e) => e.stopPropagation()} disabled={isBusy}
                          style={{ opacity: isBusy ? 0.7 : 1, background: '#f43f5e', color: '#fff', border: '1px solid #e11d48', padding: '6px 10px', borderRadius: 8, fontWeight: 700 }}>
                          {busyLabel('reject') || 'Reject'}
                        </button>
                        <button type="button" className="btn" onClick={acceptConnection} onMouseDown={(e) => e.stopPropagation()} disabled={isBusy}
                          style={{ opacity: isBusy ? 0.7 : 1, background: '#0f766e', color: '#fff', border: '1px solid #0f766e', padding: '6px 10px', borderRadius: 8, fontWeight: 700 }}>
                          {busyLabel('accept') || 'Accept'}
                        </button>
                      </div>
                    )}

                    <div className="muted" style={{ fontSize: 11, marginTop: 4, display: 'flex', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                      {mine && sending && <span>· sending…</span>}
                      {mine && failed && (
                        <>
                          <span style={{ color: '#f43f5e' }}>· failed</span>
                          <button type="button" className="btn btn-neutral" style={{ padding: '0 6px', fontSize: 11 }} onClick={() => retrySend(m)}>
                            retry
                          </button>
                        </>
                      )}
                      
                    </div>

                    {(showMenuMine || showPartnerMenu) && (
                      <button type="button" className="btn btn-neutral" onClick={(e) => { e.stopPropagation(); setMenuOpenFor(menuOpenFor === m.id ? null : m.id) }} title="More"
                        style={{ position: 'absolute', top: -6, right: mine ? -6 : 'auto', left: mine ? 'auto' : -6, padding: '0 6px', fontSize: 12 }}>
                        ⋯
                      </button>
                    )}

                    {menuOpenFor === m.id && (
                      <div
                        style={{ position: 'absolute', top: 18, right: mine ? -6 : 'auto', left: mine ? 'auto' : -6, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 18px rgba(0,0,0,0.12)', padding: 6, zIndex: 5 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {mine ? (
                          <button type="button" className="btn btn-neutral" style={{ width: '100%' }} onClick={() => deleteMessage(m.id)}>
                            Delete
                          </button>
                        ) : (
                          <button type="button" className="btn btn-neutral" style={{ width: '100%' }} onClick={() => { setMenuOpenFor(null); reportUser({ reporterId: me.id, reportedId: partnerId }) }}>
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
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ maxWidth: '60%', padding: '6px 10px', borderRadius: 12, background: '#f1f5f9', border: '1px solid var(--border)', color: '#0f172a', fontSize: 12 }}>
                  typing…
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* composer */}
      {(!!me?.id && partnerId) ? (
        <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)', alignItems: 'center' }}>
          <input type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} id="pick-image" />
          <input type="file" onChange={onPickFile} style={{ display: 'none' }} id="pick-file" />

          <div style={{ display: 'flex', gap: 6 }}>
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
                : connStatus === 'pending_in'
                  ? 'Respond to the request above to start messaging…'
                  : connStatus === 'pending_out'
                    ? 'Waiting for acceptance… (you can also Accept)'
                    : 'Not connected yet — Connect or Accept if they already requested you.'
            }
            style={{ flex: 1, resize: 'none', minHeight: 42, maxHeight: 120 }}
          />
          <button className="btn btn-primary" type="submit" disabled={!text.trim() || connStatus !== 'accepted'} title={connStatus === 'accepted' ? 'Send' : 'You must be connected to send'}>
            Send
          </button>
        </form>
      ) : (
        <div className="muted" style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          {me?.id ? 'Select a person to start chatting.' : 'Sign in to send messages.'}
        </div>
      )}
    </div>
  )
}






















