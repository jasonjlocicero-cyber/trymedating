// src/components/ChatAlerts.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Toast alerts for new messages (with soft chime + mute toggle).
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

  // === sound prefs (persist) ===
  const PREF_KEY = 'chatSoundEnabled'
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { const raw = localStorage.getItem(PREF_KEY); return raw == null ? true : JSON.parse(raw) === true } catch { return true }
  })
  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify(!!soundEnabled)) } catch {} }, [soundEnabled])

  // web audio
  const audioCtxRef = useRef(null)
  function ensureAudioCtx() {
    if (audioCtxRef.current) return audioCtxRef.current
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      audioCtxRef.current = new Ctx()
      return audioCtxRef.current
    } catch { return null }
  }
  useEffect(() => {
    function unlock() {
      const ctx = ensureAudioCtx()
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{})
      window.removeEventListener('click', unlock)
      window.removeEventListener('touchstart', unlock)
    }
    window.addEventListener('click', unlock, { once:true })
    window.addEventListener('touchstart', unlock, { once:true })
    return () => {
      window.removeEventListener('click', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [])

  // subscribe to all message inserts and filter client-side
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

          // cache sender mini-profile
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

  // show one toast at a time + play chime
  useEffect(() => {
    if (visible || queue.length === 0) return
    const [next, ...rest] = queue
    setQueue(rest)
    setVisible(next)

    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(null), 5000)

    if (soundEnabled) playChime(ensureAudioCtx())
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [queue, visible, soundEnabled])

  if (!visible) return null

  const openNow = () => {
    const peer = visible.sender ? { id: visible.sender.id, handle: visible.sender.handle, avatar_url: visible.sender.avatar_url } : undefined
    onOpenChat?.(visible.convo_id, peer)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(null)
  }
  const dismiss = () => { if (hideTimer.current) clearTimeout(hideTimer.current); setVisible(null) }
  const toggleSound = () => {
    setSoundEnabled(prev => !prev)
    if (!soundEnabled) {
      const ctx = ensureAudioCtx()
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{})
    }
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
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
              <div style={{ fontWeight:800, fontSize:14, display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {visible.sender?.handle ? `@${visible.sender.handle}` : 'New message'}
                </span>
                <span style={{ fontSize:10, color:'var(--muted)' }}>• now</span>
              </div>
              <button type="button" onClick={toggleSound} title={soundEnabled ? 'Mute sound' : 'Unmute sound'} style={iconBtn}>
                {soundEnabled ? '🔔' : '🔕'}
              </button>
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

function playChime(ctx) {
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const master = ctx.createGain()
    master.gain.value = 0.00001
    master.connect(ctx.destination)

    const note = (t, f, dur = 0.22, g = 0.6) => {
      const osc = ctx.createOscillator()
      const gn = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, t)
      osc.connect(gn); gn.connect(master)
      gn.gain.setValueAtTime(0.00001, t)
      gn.gain.exponentialRampToValueAtTime(g, t + 0.02)
      gn.gain.exponentialRampToValueAtTime(0.00001, t + dur)
      osc.start(t); osc.stop(t + dur + 0.02)
    }

    master.gain.setValueAtTime(0.00001, now)
    master.gain.exponentialRampToValueAtTime(0.9, now + 0.02)
    master.gain.exponentialRampToValueAtTime(0.00001, now + 0.8)

    note(now + 0.00, 440, 0.22, 0.5)     // A4
    note(now + 0.18, 554.37, 0.28, 0.45) // C#5
  } catch {}
}

const wrap = { position:'fixed', left:16, bottom:16, zIndex:60 }
const card = { width:340, border:'1px solid var(--border)', borderRadius:12, background:'#fff', boxShadow:'0 14px 40px rgba(0,0,0,0.18)', padding:10 }
const iconBtn = {
  border:'1px solid var(--border)', background:'#fff', borderRadius:8, padding:'2px 8px',
  height:28, cursor:'pointer'
}


