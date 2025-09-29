// src/components/ChatAlerts.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Push-style message alerts with a soft chime.
 *
 * Props:
 * - me: { id, email, handle? }
 * - isChatOpen: boolean
 * - activeConvoId: string|number|null
 * - recentConvoIds: (string|number)[]
 * - onOpenChat: (convoId: string|number, peer?: { id, handle?: string, avatar_url?: string }) => void
 */
export default function ChatAlerts({
  me,
  isChatOpen,
  activeConvoId,
  recentConvoIds,
  onOpenChat
}) {
  const [queue, setQueue] = useState([])   // toast queue
  const [visible, setVisible] = useState(null) // current toast
  const hideTimer = useRef(null)
  const profileCache = useRef(new Map())

  // === Sound prefs (persisted) ===
  const PREF_KEY = 'chatSoundEnabled'
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY)
      return raw == null ? true : JSON.parse(raw) === true
    } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(!!soundEnabled)) } catch {}
  }, [soundEnabled])

  // === Audio context (lazy) ===
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
  // “Unlock” on first user interaction (helps with mobile autoplay policies)
  useEffect(() => {
    function unlock() {
      const ctx = ensureAudioCtx()
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{})
      window.removeEventListener('click', unlock)
      window.removeEventListener('touchstart', unlock)
    }
    window.addEventListener('click', unlock, { once: true })
    window.addEventListener('touchstart', unlock, { once: true })
    return () => {
      window.removeEventListener('click', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [])

  const myId = me?.id
  const convoSet = useMemo(() => new Set((recentConvoIds || []).map(String)), [recentConvoIds])

  // Subscribe to new messages globally; filter client-side
  useEffect(() => {
    if (!myId) return
    const ch = supabase
      .channel('alerts:messages')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const m = payload.new
          if (!m || m.sender_id === myId) return
          if (!convoSet.has(String(m.convo_id))) return
          if (isChatOpen && String(activeConvoId) === String(m.convo_id)) return

          // Fetch sender mini-profile (cached)
          let sender = profileCache.current.get(m.sender_id)
          if (!sender) {
            const { data } = await supabase
              .from('profiles')
              .select('handle, avatar_url')
              .eq('user_id', m.sender_id)
              .maybeSingle()
            sender = {
              id: m.sender_id,
              handle: data?.handle || (m.sender_id || '').slice(0, 6),
              avatar_url: data?.avatar_url || ''
            }
            profileCache.current.set(m.sender_id, sender)
          }

          const item = { ...m, sender }
          setQueue(prev => [...prev, item])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [myId, convoSet, isChatOpen, activeConvoId])

  // Show one toast at a time; play a soft chime
  useEffect(() => {
    if (visible || queue.length === 0) return
    const [next, ...rest] = queue
    setQueue(rest)
    setVisible(next)

    // Auto-hide after 5s
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(null), 5000)

    // Play sound (best effort)
    if (soundEnabled) {
      playChime(ensureAudioCtx())
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [queue, visible, soundEnabled])

  if (!visible) return null

  const openNow = () => {
    const peer = visible.sender ? {
      id: visible.sender.id,
      handle: visible.sender.handle,
      avatar_url: visible.sender.avatar_url
    } : undefined
    onOpenChat?.(visible.convo_id, peer)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(null)
  }

  const dismiss = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(null)
  }

  const toggleSound = () => {
    setSoundEnabled(prev => !prev)
    // attempt to resume context when enabling
    if (!soundEnabled) {
      const ctx = ensureAudioCtx()
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{})
    }
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
          <Avatar url={visible.sender?.avatar_url} />
          <div style={{ flex:1, minWidth: 0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
              <div style={{ fontWeight: 800, fontSize: 14, display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                <span style={{ whiteSpace:'nowrap', textOverflow:'ellipsis', overflow:'hidden' }}>
                  {visible.sender?.handle ? `@${visible.sender.handle}` : 'New message'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>• now</span>
              </div>
              <button
                type="button"
                onClick={toggleSound}
                title={soundEnabled ? 'Mute sound' : 'Unmute sound'}
                style={iconBtn}
              >
                {soundEnabled ? '🔔' : '🔕'}
              </button>
            </div>

            <div style={{
              fontSize: 13, color: '#111', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260
            }}>
              {visible.body}
            </div>

            <div style={{ display:'flex', gap:8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={openNow} style={{ padding:'4px 10px', height:28 }}>
                Open
              </button>
              <button className="btn" onClick={dismiss} style={{ padding:'4px 10px', height:28 }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ===== Soft chime (Web Audio API) =====
   Two mellow sine notes with brief envelopes. */
function playChime(ctx) {
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const master = ctx.createGain()
    master.gain.value = 0.00001
    master.connect(ctx.destination)

    // Note helper
    const note = (time, freq, dur = 0.22, gain = 0.6) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, time)
      osc.connect(g)
      g.connect(master)

      // quick, soft envelope
      g.gain.setValueAtTime(0.00001, time)
      g.gain.exponentialRampToValueAtTime(gain, time + 0.02)
      g.gain.exponentialRampToValueAtTime(0.00001, time + dur)

      osc.start(time)
      osc.stop(time + dur + 0.02)
    }

    // ramp master up just for the chime, then back down
    master.gain.setValueAtTime(0.00001, now)
    master.gain.exponentialRampToValueAtTime(0.9, now + 0.02)
    master.gain.exponentialRampToValueAtTime(0.00001, now + 0.8)

    // Two gentle notes (A4 -> C#5)
    note(now + 0.00, 440, 0.22, 0.5)
    note(now + 0.18, 554.37, 0.28, 0.45)
  } catch {
    // ignore audio failures silently
  }
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
const iconBtn = {
  border: '1px solid var(--border)',
  background: '#fff',
  borderRadius: 8,
  padding: '2px 8px',
  height: 28,
  cursor: 'pointer'
}

