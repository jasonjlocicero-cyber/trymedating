// src/components/ChatAlerts.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Toast alerts for new messages when the active convo isn't open.
 *
 * Props:
 * - me
 * - isChatOpen: boolean
 * - activeConvoId: string|number|null
 * - recentConvoIds: (string|number)[]
 * - onOpenChat: (convoId, peer?) => void
 */
export default function ChatAlerts({ me, isChatOpen, activeConvoId, recentConvoIds, onOpenChat }) {
  const [queue, setQueue] = useState([])
  const [visible, setVisible] = useState(null)
  const hideTimer = useRef(null)
  const myId = me?.id
  const convoSet = useMemo(() => new Set((recentConvoIds || []).map(String)), [recentConvoIds])
  const profileCache = useRef(new Map())

  useEffect(() => {
    if (!myId) return
    const ch = supabase
      .channel('alerts:messages')
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'messages' },
        async (payload) => {
          const m = payload.new
          if (!m || m.sender_id === myId) return
          if (!convoSet.has(String(m.convo_id))) return
          if (isChatOpen && String(activeConvoId) === String(m.convo_id)) return

          let sender = profileCache.current.get(m.sender_id)
          if (!sender) {
            const { data } = await supabase
              .from('profiles')
              .select('handle, avatar_url')
              .eq('user_id', m.sender_id)
              .maybeSingle()
            sender = { id: m.sender_id, handle: data?.handle || (m.sender_id||'').slice(0,6), avatar_url: data?.avatar_url || '' }
            profileCache.current.set(m.sender_id, sender)
          }
          setQueue(prev => [...prev, { ...m, sender }])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [myId, convoSet, isChatOpen, activeConvoId])

  useEffect(() => {
    if (visible || queue.length === 0) return
    const [next, ...rest] = queue
    setQueue(rest)
    setVisible(next)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(null), 5000)
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [queue, visible])

  if (!visible) return null

  const openNow = () => {
    const peer = visible.sender ? { id: visible.sender.id, handle: visible.sender.handle, avatar_url: visible.sender.avatar_url } : undefined
    onOpenChat?.(visible.convo_id, peer)
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
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: visible.sender?.avatar_url ? `url(${visible.sender.avatar_url}) center/cover no-repeat` : '#f1f5f9',
            border: '1px solid var(--border)', flex:'0 0 32px'
          }} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:800, fontSize:14, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {visible.sender?.handle ? `@${visible.sender.handle}` : 'New message'}
              </span>
              <span style={{ fontSize:10, color:'var(--muted)' }}>• now</span>
            </div>
            <div style={{ fontSize:13, color:'#111', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:260 }}>
              {visible.body}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button className="btn btn-primary" onClick={openNow} style={{ padding:'4px 10px', height:28 }}>Open</button>
              <button className="btn" onClick={dismiss} style={{ padding:'4px 10px', height:28 }}>Dismiss</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const wrap = { position:'fixed', left:16, bottom:16, zIndex:60 }
const card = { width:340, border:'1px solid var(--border)', borderRadius:12, background:'#fff', boxShadow:'0 14px 40px rgba(0,0,0,0.18)', padding:10 }

