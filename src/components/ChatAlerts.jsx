// src/components/ChatAlerts.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Push-style message alerts.
 *
 * Props:
 * - me: { id, email, handle? }
 * - isChatOpen: boolean
 * - activeConvoId: string | number | null
 * - recentConvoIds: (string|number)[]   // known convos for this user (we only alert for these)
 * - onOpenChat: (convoId: string|number, peer?: { id, handle?: string, avatar_url?: string }) => void
 */
export default function ChatAlerts({
  me,
  isChatOpen,
  activeConvoId,
  recentConvoIds,
  onOpenChat
}) {
  const [queue, setQueue] = useState([]) // [{ id, convo_id, sender_id, body, created_at, sender }]
  const [visible, setVisible] = useState(null) // current toast item
  const hideTimer = useRef(null)
  const profileCache = useRef(new Map()) // sender_id -> { handle, avatar_url }

  const myId = me?.id
  const convoSet = useMemo(() => new Set((recentConvoIds || []).map(String)), [recentConvoIds])

  // Subscribe to new messages globally; filter client-side to convos we care about
  useEffect(() => {
    if (!myId) return
    const ch = supabase
      .channel('alerts:messages')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const m = payload.new
          // Only alert if:
          // - not from me
          // - convo is one we know (recentConvoIds)
          // - and either chat is closed or it’s a different convo
          if (!m || m.sender_id === myId) return
          if (!convoSet.has(String(m.convo_id))) return
          if (isChatOpen && String(activeConvoId) === String(m.convo_id)) return

          // Enrich with sender profile (handle/avatar)
          let sender = profileCache.current.get(m.sender_id)
          if (!sender) {
            const { data, error } = await supabase
              .from('profiles')
              .select('handle, avatar_url')
              .eq('user_id', m.sender_id)
              .maybeSingle()
            sender = {
              id: m.sender_id,
              handle: data?.handle || (m.sender_id || '').slice(0, 6),
              avatar_url: data?.avatar_url || ''
            }
            if (!error) profileCache.current.set(m.sender_id, sender)
          }

          const item = { ...m, sender }
          setQueue(prev => [...prev, item])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [myId, convoSet, isChatOpen, activeConvoId])

  // Show one toast at a time
  useEffect(() => {
    if (visible || queue.length === 0) return
    const [next, ...rest] = queue
    setQueue(rest)
    setVisible(next)
    // auto-hide after 5s
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(null), 5000)
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [queue, visible])

  if (!visible) return null

  const openNow = () => {
    const peer = visible.sender ? {
      id: visible.sender.id,
      handle: visible.sender.handle,
      avatar_url: visible.sender.avatar_url
    } : undefined
    onOpenChat?.(visible.convo_id, peer)
    // hide immediately
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(null)
  }

  const dismiss = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(null)
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display:'flex', gap:10 }}>
          <Avatar url={visible.sender?.avatar_url} />
          <div style={{ flex:1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, display:'flex', alignItems:'center', gap:6 }}>
              <span>{visible.sender?.handle ? `@${visible.sender.handle}` : 'New message'}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>• now</span>
            </div>
            <div style={{
              fontSize: 13, color: '#111', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260
            }}>
              {visible.body}
            </div>
            <div style={{ display:'flex', gap:8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={openNow} style={{ padding:'4px 10px', height:28 }}>Open</button>
              <button className="btn" onClick={dismiss} style={{ padding:'4px 10px', height:28 }}>Dismiss</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Avatar({ url }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8,
      background: url ? `url(${url}) center/cover no-repeat` : '#f1f5f9',
      border: '1px solid var(--border)',
      flex: '0 0 32px'
    }} />
  )
}

const wrap = {
  position:'fixed',
  left: 16,
  bottom: 16,
  zIndex: 60
}
const card = {
  width: 340,
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: '#fff',
  boxShadow: '0 14px 40px rgba(0,0,0,0.18)',
  padding: 10
}
