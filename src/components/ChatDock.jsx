import React, { useEffect, useRef, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock (Draggable + Resizable + Persisted + Snap + Restore + Notifications + Search)
 * - Multiple draggable/resizable chat windows (cap 3)
 * - Positions & sizes saved per partner in localStorage
 * - Snap to nearest corner; grid snap elsewhere
 * - Restore default size/position button
 * - Sound + Desktop notifications for new incoming messages (per-chat toggles)
 * - NEW: In-chat Search (🔎)
 *   - Toggle search bar per chat
 *   - Case-insensitive highlight with <mark>
 *   - Match count + Prev/Next navigation
 *   - Auto-scroll to current match
 *   - Ctrl/⌘+F focuses search box for active chat
 * - Auto-focus input, unread badges, typing indicators
 * - Emits 'chatdock:status' and 'chatdock:unread'
 * - Global: window.trymeChat.open({ handle, user_id })
 */

const DEF_W = 320
const DEF_H = 420
const MIN_W = 280
const MIN_H = 320
const MAX_W = 560
const MAX_H = 720

const EDGE_GAP = 16
const FOOTER_CLEAR = 120
const GRID = 12
const SNAP_THRESH = 40

// Very short ping sound; replace with your own if desired
const PING_DATA_URL =
  'data:audio/wav;base64,UklGRkSXAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YUTWAQAAgP8AAP8AgAAAAP8A/4AAf/8AAP8A/4AAAP8AAAD/AAAA/wD/gAAf/8AAP8A/4AAAP8AAAD/AAAA/wD/gAB///8AAAD/gAAA'

function playPing() {
  try {
    const a = new Audio(PING_DATA_URL)
    a.volume = 0.35
    a.play().catch(() => {})
  } catch {}
}

function useMe() {
  const [me, setMe] = useState(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setMe(user || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setMe(session?.user || null)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])
  return me
}

async function fetchProfileByHandle(handle) {
  const { data } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url, mode')
    .eq('handle', (handle || '').toLowerCase())
    .maybeSingle()
  return data || null
}
async function fetchProfileByUserId(user_id) {
  const { data } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url, mode')
    .eq('user_id', user_id)
    .maybeSingle()
  return data || null
}

// ---------- Helpers ---------------------------------------------------------

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function highlightText(text, query) {
  if (!query) return text
  const parts = []
  try {
    const re = new RegExp(escapeRegExp(query), 'ig')
    let lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      const start = m.index
      const end = re.lastIndex
      if (start > lastIndex) parts.push(text.slice(lastIndex, start))
      parts.push(<mark key={start}>{text.slice(start, end)}</mark>)
      lastIndex = end
      if (m.index === re.lastIndex) re.lastIndex++ // safety
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts.length ? parts : text
  } catch {
    return text
  }
}

// ---------- ChatWindow (UI) -------------------------------------------------

function ChatWindow({
  me, partner,
  active, minimized,
  onClose, onMinimize,
  onFocus,
  onUnreadChange,
  onRestore,
  onIncoming,
  inputAutoFocusRef,
  width, height
}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [theirTyping, setTheirTyping] = useState(false)

  // Search state (NEW)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0) // 0-based index among matches
  const searchInputRef = useRef(null)

  // Per-chat notification toggles
  const soundKey = partner?.user_id ? `tmd_sound_${partner.user_id}` : null
  const notifyKey = partner?.user_id ? `tmd_notify_${partner.user_id}` : null
  const [soundOn, setSoundOn] = useState(true)
  const [notifyOn, setNotifyOn] = useState(true)

  useEffect(() => {
    if (!soundKey || !notifyKey) return
    const sRaw = localStorage.getItem(soundKey)
    const nRaw = localStorage.getItem(notifyKey)
    setSoundOn(sRaw === null ? true : sRaw === '1')
    setNotifyOn(nRaw === null ? true : nRaw === '1')
  }, [soundKey, notifyKey])

  function persistSound(on) { if (soundKey) localStorage.setItem(soundKey, on ? '1' : '0') }
  function persistNotify(on) { if (notifyKey) localStorage.setItem(notifyKey, on ? '1' : '0') }

  const inputRef = useRef(null)
  const bottomRef = useRef(null)
  const typingTimerRef = useRef(null)
  const lastTypingSentRef = useRef(0)
  const lastAlertRef = useRef(0) // notification cooldown

  const lastReadKey = me && partner ? `tmd_last_read_${me.id}_${partner.user_id}` : null
  function getLastRead() {
    if (!lastReadKey) return 0
    const raw = localStorage.getItem(lastReadKey)
    return raw ? Number(raw) : 0
  }
  function markReadNow() {
    if (!lastReadKey) return
    localStorage.setItem(lastReadKey, String(Date.now()))
  }

  // Load history
  useEffect(() => {
    if (!me || !partner?.user_id) return
    ;(async () => {
      try {
        setLoading(true); setError('')
        const { data, error } = await supabase
          .from('messages')
          .select('id, sender, recipient, body, created_at')
          .or(`and(sender.eq.${me.id},recipient.eq.${partner.user_id}),and(sender.eq.${partner.user_id},recipient.eq.${me.id})`)
          .order('created_at', { ascending: false })
          .limit(200)
        if (error) throw error
        setMessages((data || []).reverse())
      } catch (e) {
        setError(e.message || 'Failed to load messages.')
      } finally {
        setLoading(false)
      }
    })()
  }, [me?.id, partner?.user_id])

  // Realtime: new messages
  useEffect(() => {
    if (!me || !partner?.user_id) return
    const channel = supabase
      .channel(`realtime:dm:${partner.user_id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          const m = payload.new
          const relevant =
            (m.sender === me.id && m.recipient === partner.user_id) ||
            (m.sender === partner.user_id && m.recipient === me.id)
          if (!relevant) return
          setMessages(prev => [...prev, m])

          // New incoming from them?
          if (m.sender === partner.user_id) {
            const now = Date.now()
            if (now - lastAlertRef.current > 6000) {
              lastAlertRef.current = now
              onIncoming?.({ partner, message: m, soundOn, notifyOn, active, minimized })
            }
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [me?.id, partner?.user_id, soundOn, notifyOn, active, minimized, onIncoming, partner])

  // Typing indicator
  useEffect(() => {
    if (!me?.id || !partner?.user_id) return
    const [a, b] = [me.id, partner.user_id].sort()
    const room = `typing:${a}:${b}`
    const channel = supabase.channel(room)
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { from, to } = payload.payload || {}
        if (from === partner.user_id && to === me.id) {
          setTheirTyping(true)
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => setTheirTyping(false), 3000)
        }
      })
      .subscribe()
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [me?.id, partner?.user_id])

  async function sendTypingSignal() {
    if (!me?.id || !partner?.user_id) return
    const now = Date.now()
    if (now - lastTypingSentRef.current < 800) return
    lastTypingSentRef.current = now
    const [a, b] = [me.id, partner.user_id].sort()
    const room = `typing:${a}:${b}`
    await supabase.channel(room).send({
      type: 'broadcast',
      event: 'typing',
      payload: { from: me.id, to: partner.user_id }
    })
  }

  // Keyboard shortcut: Ctrl/⌘+F to open/focus search (only for active + not minimized)
  useEffect(() => {
    function onKeydown(e) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.key.toLowerCase() !== 'f') return
      if (!active || minimized) return
      e.preventDefault()
      setSearchOpen(true)
      setTimeout(() => searchInputRef.current?.focus(), 0)
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [active, minimized])

  // Scroll & focus
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])
  useEffect(() => { if (active && !minimized) setTimeout(() => inputRef.current?.focus(), 0) }, [active, minimized])

  // Unread logic
  useEffect(() => {
    if (!messages.length || !partner?.user_id) {
      onUnreadChange?.(partner?.user_id, 0)
      return
    }
    const lastReadAt = getLastRead()
    const unread = messages.filter(
      m => m.sender === partner.user_id && new Date(m.created_at).getTime() > lastReadAt
    ).length
    if (active && !minimized) {
      if (unread > 0) { markReadNow(); onUnreadChange?.(partner.user_id, 0) }
      else { onUnreadChange?.(partner.user_id, 0) }
    } else {
      onUnreadChange?.(partner.user_id, unread)
    }
  }, [messages, active, minimized, partner?.user_id])

  // Send
  async function send() {
    if (!draft.trim() || !me || !partner?.user_id) return
    const body = draft.trim().slice(0, 2000)
    setDraft('')
    const { error } = await supabase.from('messages').insert({
      sender: me.id, recipient: partner.user_id, body
    })
    if (error) setError(error.message)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // --- Search computations --------------------------------------------------

  // Build a flat list of {id, text, mine, created_at} for easier matching
  const normalized = useMemo(() => {
    return messages.map(m => ({
      id: m.id,
      text: String(m.body || ''),
      mine: m.sender === me?.id,
      created_at: m.created_at
    }))
  }, [messages, me?.id])

  // Compute match indexes [ { msgIdx } ... ] for current search query
  const matches = useMemo(() => {
    if (!searchQuery) return []
    const q = searchQuery.trim()
    if (!q) return []
    const re = new RegExp(escapeRegExp(q), 'i')
    const out = []
    normalized.forEach((row, idx) => {
      if (re.test(row.text)) out.push({ msgIdx: idx })
    })
    return out
  }, [searchQuery, normalized])

  // Keep matchIndex in bounds
  useEffect(() => {
    if (!matches.length) { setMatchIndex(0); return }
    setMatchIndex(i => Math.max(0, Math.min(i, matches.length - 1)))
  }, [matches.length])

  // Refs to message DOM nodes for scrolling to current match
  const msgRefs = useRef({})
  useEffect(() => {
    if (!matches.length) return
    const target = matches[matchIndex]
    const msg = normalized[target.msgIdx]
    const el = msgRefs.current[msg.id]
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [matchIndex, matches, normalized])

  function gotoPrev() {
    if (!matches.length) return
    setMatchIndex(i => (i - 1 + matches.length) % matches.length)
  }
  function gotoNext() {
    if (!matches.length) return
    setMatchIndex(i => (i + 1) % matches.length)
  }

  const avatar = partner?.avatar_url || 'https://via.placeholder.com/28?text=%F0%9F%98%8A'
  const name = partner?.display_name || partner?.handle || 'Unknown'

  return (
    <div
      onMouseDown={() => onFocus?.(partner.user_id)}
      style={{
        width, height, background:'#fff',
        border:'1px solid #ddd', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.08)',
        display:'flex', flexDirection:'column', overflow:'hidden', position:'relative'
      }}
    >
      {/* Header */}
      <div
        className="drag-handle"
        style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'8px 10px', borderBottom:'1px solid #eee', background:'#f9fafb',
          cursor:'move', userSelect:'none'
        }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <img src={avatar} alt="" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover', border:'1px solid #eee' }} />
          <div style={{ fontWeight:700, fontSize:14 }}>
            {name} <span style={{ opacity:.7, fontWeight:400 }}>@{partner?.handle}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {/* Search toggle */}
          <button
            onClick={() => { setSearchOpen(v => !v); setTimeout(()=> searchOpen ? null : searchInputRef.current?.focus(), 0) }}
            title="Search in conversation (Ctrl/⌘+F)"
            style={iconBtnStyle}
          >🔎</button>
          {/* Toggle sound */}
          <button
            onClick={() => { const v = !soundOn; setSoundOn(v); persistSound(v) }}
            title={soundOn ? 'Mute sound' : 'Enable sound'}
            style={iconBtnStyle}
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
          {/* Toggle desktop notifications */}
          <button
            onClick={async () => {
              const v = !notifyOn
              setNotifyOn(v); persistNotify(v)
              if (v && 'Notification' in window && Notification.permission === 'default') {
                try { await Notification.requestPermission() } catch {}
              }
            }}
            title={notifyOn ? 'Disable desktop notifications' : 'Enable desktop notifications'}
            style={iconBtnStyle}
          >
            {notifyOn ? '🖥️' : '🚫'}
          </button>
          {/* Restore */}
          <button onClick={onRestore} title="Restore default size & position" style={iconBtnStyle}>↺</button>
          <button onClick={onMinimize} title="Minimize" style={iconBtnStyle}>—</button>
          <button onClick={onClose} title="Close" style={iconBtnStyle}>×</button>
        </div>
      </div>

      {/* Search bar (NEW) */}
      {searchOpen && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderBottom:'1px solid #eee', background:'#fff' }}>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages…"
            style={{ flex:1, padding:'8px 10px', border:'1px solid #ddd', borderRadius:8 }}
          />
          <div style={{ fontSize:12, opacity:.7, minWidth:60, textAlign:'center' }}>
            {matches.length ? `${matchIndex + 1} / ${matches.length}` : '0 / 0'}
          </div>
          <button onClick={gotoPrev} disabled={!matches.length} style={smallBtn}>‹</button>
          <button onClick={gotoNext} disabled={!matches.length} style={smallBtn}>›</button>
          <button onClick={() => setSearchOpen(false)} style={smallBtn}>✕</button>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex:1, overflow:'auto', padding:10, background:'#fafafa' }}>
        {loading && <div>Loading…</div>}
        {error && <div style={{ color:'#C0392B' }}>{error}</div>}
        {!loading && messages.length === 0 && <div style={{ opacity:.7 }}>Say hi 👋</div>}
        {normalized.map((row, idx) => {
          const mine = row.mine
          const isCurrent = matches.length && matches[matchIndex]?.msgIdx === idx
          return (
            <div
              key={row.id}
              ref={el => { msgRefs.current[row.id] = el }}
              style={{ display:'flex', marginBottom:8, justifyContent: mine?'flex-end':'flex-start' }}
            >
              <div style={{
                maxWidth:'75%',
                background: mine ? '#2A9D8F' : '#fff',
                color: mine ? '#fff' : '#222',
                border: mine ? 'none' : '1px solid #eee',
                borderRadius:14, padding:'8px 12px',
                outline: isCurrent ? '2px solid #2A9D8F' : 'none'
              }}>
                <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                  {highlightText(row.text, searchQuery)}
                </div>
                <div style={{ fontSize:11, opacity:.7, marginTop:2 }}>
                  {new Date(row.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      <div style={{ minHeight: theirTyping ? 18 : 0, padding: theirTyping ? '0 10px 6px' : 0, fontSize: 12, color:'#7a7a7a' }}>
        {theirTyping ? `${partner?.display_name || partner?.handle || 'They'} is typing…` : null}
      </div>

      {/* Composer */}
      <div style={{ borderTop:'1px solid #eee', padding:8, display:'flex', gap:6, background:'#fff' }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={e=>{ setDraft(e.target.value); sendTypingSignal() }}
          onKeyDown={e=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send() } }}
          placeholder="Type a message…"
          style={{ flex:1, padding:10, borderRadius:10, border:'1px solid #ddd' }}
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          style={{ padding:'8px 12px', border:'none', borderRadius:10, background:'#2A9D8F', color:'#fff', fontWeight:700 }}
        >
          Send
        </button>
      </div>

      {/* Resize handle */}
      <div
        className="resize-handle"
        title="Drag to resize"
        style={{
          position:'absolute', right:6, bottom:6, width:14, height:14,
          borderRight:'2px solid #bbb', borderBottom:'2px solid #bbb',
          cursor:'nwse-resize', opacity:.8
        }}
      />
    </div>
  )
}

const iconBtnStyle = {
  width:28, height:28,
  border:'1px solid #ddd', borderRadius:8, background:'#fff',
  cursor:'pointer', lineHeight:'24px', textAlign:'center'
}
const smallBtn = {
  padding:'6px 8px',
  border:'1px solid #ddd',
  borderRadius:6,
  background:'#fff',
  cursor:'pointer'
}

// ---------- ChatDock (logic) -----------------------------------------------

export default function ChatDock() {
  const me = useMe()
  const [activeUserId, setActiveUserId] = useState(null)
  const [items, setItems] = useState([]) // [{ key, partner, minimized, unread, x, y, z, w, h }]
  const [profilesCache, setProfilesCache] = useState({})

  // Footer hide + navbar dot
  function emitStatus(updated = items) {
    window.dispatchEvent(new CustomEvent('chatdock:status', { detail: { open: updated.length > 0 } }))
    const totalUnread = updated.reduce((sum, x) => sum + (x.unread || 0), 0)
    window.dispatchEvent(new CustomEvent('chatdock:unread', { detail: { count: totalUnread } }))
  }
  useEffect(() => { emitStatus() }, [items])

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }
  function viewport() { return { w: window.innerWidth, h: window.innerHeight } }

  // localStorage helpers
  function loadPos(uid) { try { return JSON.parse(localStorage.getItem(`tmd_pos_${uid}`) || 'null') } catch { return null } }
  function savePos(uid, x, y) { localStorage.setItem(`tmd_pos_${uid}`, JSON.stringify({ x, y })) }
  function loadSize(uid) { try { return JSON.parse(localStorage.getItem(`tmd_size_${uid}`) || 'null') } catch { return null } }
  function saveSize(uid, w, h) { localStorage.setItem(`tmd_size_${uid}`, JSON.stringify({ w, h })) }

  // initial frame
  function initialFrame(index, uid) {
    const pos = loadPos(uid)
    const size = loadSize(uid)
    const { w: vw, h: vh } = viewport()
    const xDefault = vw - EDGE_GAP - DEF_W - index * (DEF_W + 12)
    const yDefault = vh - EDGE_GAP - FOOTER_CLEAR - DEF_H
    const x = pos?.x ?? Math.max(EDGE_GAP, xDefault)
    const y = pos?.y ?? Math.max(EDGE_GAP, yDefault)
    const w = clamp(size?.w ?? DEF_W, MIN_W, Math.min(MAX_W, vw - 2*EDGE_GAP))
    const h = clamp(size?.h ?? DEF_H, MIN_H, Math.min(MAX_H, vh - FOOTER_CLEAR - 2*EDGE_GAP))
    return { x, y, w, h }
  }

  // Snap helpers
  function snapToGrid(val, size, max) {
    const clamped = clamp(val, EDGE_GAP, max - EDGE_GAP - size)
    const snapped = Math.round(clamped / GRID) * GRID
    return clamp(snapped, EDGE_GAP, max - EDGE_GAP - size)
  }
  function cornerTargets({ vw, vh, w, h }) {
    return [
      { x: EDGE_GAP,                 y: EDGE_GAP },
      { x: vw - EDGE_GAP - w,        y: EDGE_GAP },
      { x: EDGE_GAP,                 y: vh - EDGE_GAP - FOOTER_CLEAR - h },
      { x: vw - EDGE_GAP - w,        y: vh - EDGE_GAP - FOOTER_CLEAR - h }
    ]
  }
  function distance(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx*dx + dy*dy) }
  function snapPosition(x, y, w, h) {
    const { w: vw, h: vh } = viewport()
    const targets = cornerTargets({ vw, vh, w, h })
    const current = { x, y }
    let best = { ...current }, bestD = Infinity
    for (const t of targets) { const d = distance(current, t); if (d < bestD) { bestD = d; best = t } }
    if (bestD <= SNAP_THRESH) return { x: best.x, y: best.y }
    const gx = snapToGrid(x, w, vw)
    const gy = snapToGrid(y, h, vh - FOOTER_CLEAR)
    return { x: gx, y: gy }
  }

  // Global open()
  useEffect(() => {
    window.trymeChat = {
      open: async ({ handle, user_id } = {}) => {
        if (!supabase) return
        if (!me) { window.location.href = '/auth'; return }

        let prof = null
        if (user_id) prof = profilesCache[user_id] || await fetchProfileByUserId(user_id)
        else if (handle) prof = await fetchProfileByHandle(handle)
        if (!prof?.user_id) return

        setProfilesCache(prev => ({ ...prev, [prof.user_id]: prof }))

        setItems(prev => {
          const exists = prev.find(x => x.partner.user_id === prof.user_id)
          if (exists) {
            const maxZ = prev.reduce((m, it) => Math.max(m, it.z || 1), 1)
            const updated = prev.map(x =>
              x.partner.user_id === prof.user_id ? { ...x, minimized:false, z: maxZ + 1 } : x
            )
            setActiveUserId(prof.user_id)
            emitStatus(updated)
            return updated
          }
          const f = initialFrame(prev.length, prof.user_id)
          const maxZ = prev.reduce((m, it) => Math.max(m, it.z || 1), 1)
          const next = [...prev, {
            key: `w-${prof.user_id}`,
            partner: prof,
            minimized:false,
            unread:0,
            x: f.x, y: f.y, w: f.w, h: f.h,
            z: maxZ + 1
          }]
          setActiveUserId(prof.user_id)
          emitStatus(next)
          return next.slice(-3)
        })
      }
    }
    return () => { delete window.trymeChat }
  }, [me, profilesCache])

  function closeFor(user_id) {
    setItems(prev => {
      const next = prev.filter(x => x.partner.user_id !== user_id)
      if (activeUserId === user_id) setActiveUserId(null)
      emitStatus(next)
      return next
    })
  }
  function minimizeFor(user_id) {
    setItems(prev => prev.map(x => x.partner.user_id === user_id ? { ...x, minimized:!x.minimized } : x))
  }
  function focusFor(user_id) {
    const maxZ = items.reduce((m, it) => Math.max(m, it.z || 1), 1)
    setItems(prev => prev.map(x => x.partner.user_id === user_id ? { ...x, minimized:false, z: maxZ + 1 } : x))
    setActiveUserId(user_id)
  }
  function setUnread(partnerId, count) {
    setItems(prev => prev.map(x => x.partner.user_id === partnerId ? { ...x, unread: count } : x))
  }

  // --- Drag logic -----------------------------------------------------------
  const dragRef = useRef({ uid: null, startX: 0, startY: 0, baseX: 0, baseY: 0 })
  function onDragStart(uid, clientX, clientY) {
    const win = items.find(x => x.partner.user_id === uid)
    if (!win) return
    focusFor(uid)
    dragRef.current.uid = uid
    dragRef.current.startX = clientX
    dragRef.current.startY = clientY
    dragRef.current.baseX = win.x
    dragRef.current.baseY = win.y
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    window.addEventListener('touchmove', onDragMove, { passive: false })
    window.addEventListener('touchend', onDragEnd)
  }
  function onDragMove(e) {
    e.preventDefault?.()
    if (!dragRef.current.uid) return
    const isTouch = e.touches && e.touches.length
    const clientX = isTouch ? e.touches[0].clientX : e.clientX
    const clientY = isTouch ? e.touches[0].clientY : e.clientY
    const dx = clientX - dragRef.current.startX
    const dy = clientY - dragRef.current.startY
    setItems(prev => prev.map(x => {
      if (x.partner.user_id !== dragRef.current.uid) return x
      const { w: vw, h: vh } = viewport()
      const w = x.w || DEF_W
      const h = x.h || DEF_H
      const minX = EDGE_GAP
      const maxX = vw - EDGE_GAP - w
      const minY = EDGE_GAP
      const maxY = vh - EDGE_GAP - FOOTER_CLEAR - h
      const nx = Math.max(minX, Math.min(maxX, dragRef.current.baseX + dx))
      const ny = Math.max(minY, Math.min(maxY, dragRef.current.baseY + dy))
      return { ...x, x: nx, y: ny }
    }))
  }
  function onDragEnd() {
    const uid = dragRef.current.uid
    dragRef.current.uid = null
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
    window.removeEventListener('touchmove', onDragMove)
    window.removeEventListener('touchend', onDragEnd)
    setItems(prev => prev.map(x => {
      if (x.partner.user_id !== uid) return x
      const { x: sx, y: sy } = snapPosition(x.x, x.y, x.w || DEF_W, x.h || DEF_H)
      savePos(uid, sx, sy)
      return { ...x, x: sx, y: sy }
    }))
  }

  // --- Resize logic ---------------------------------------------------------
  const resizeRef = useRef({ uid: null, startX: 0, startY: 0, baseW: DEF_W, baseH: DEF_H })
  function onResizeStart(uid, clientX, clientY) {
    const win = items.find(x => x.partner.user_id === uid)
    if (!win) return
    focusFor(uid)
    resizeRef.current.uid = uid
    resizeRef.current.startX = clientX
    resizeRef.current.startY = clientY
    resizeRef.current.baseW = win.w || DEF_W
    resizeRef.current.baseH = win.h || DEF_H
    window.addEventListener('mousemove', onResizeMove)
    window.addEventListener('mouseup', onResizeEnd)
    window.addEventListener('touchmove', onResizeMove, { passive: false })
    window.addEventListener('touchend', onResizeEnd)
  }
  function onResizeMove(e) {
    e.preventDefault?.()
    if (!resizeRef.current.uid) return
    const isTouch = e.touches && e.touches.length
    const clientX = isTouch ? e.touches[0].clientX : e.clientX
    const clientY = isTouch ? e.touches[0].clientY : e.clientY
    const dx = clientX - resizeRef.current.startX
    const dy = clientY - resizeRef.current.startY
    const { w: vw, h: vh } = viewport()

    setItems(prev => prev.map(x => {
      if (x.partner.user_id !== resizeRef.current.uid) return x
      let nw = (resizeRef.current.baseW + dx)
      let nh = (resizeRef.current.baseH + dy)
      nw = Math.max(MIN_W, Math.min(Math.min(MAX_W, vw - 2*EDGE_GAP), nw))
      nh = Math.max(MIN_H, Math.min(Math.min(MAX_H, vh - FOOTER_CLEAR - 2*EDGE_GAP), nh))
      let nx = x.x
      let ny = x.y
      nx = Math.max(EDGE_GAP, Math.min(vw - EDGE_GAP - nw, nx))
      ny = Math.max(EDGE_GAP, Math.min(vh - EDGE_GAP - FOOTER_CLEAR - nh, ny))
      return { ...x, w: nw, h: nh, x: nx, y: ny }
    }))
  }
  function onResizeEnd() {
    const uid = resizeRef.current.uid
    resizeRef.current.uid = null
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', onResizeEnd)
    window.removeEventListener('touchmove', onResizeMove)
    window.removeEventListener('touchend', onResizeEnd)
    const win = items.find(x => x.partner.user_id === uid)
    if (win) saveSize(uid, win.w, win.h)
  }

  // Restore default frame
  function initialFrameForRestore(user_id) {
    const { w: vw, h: vh } = viewport()
    const x = vw - EDGE_GAP - DEF_W
    const y = vh - EDGE_GAP - FOOTER_CLEAR - DEF_H
    return { x, y, w: DEF_W, h: DEF_H }
  }
  function restoreFor(user_id) {
    setItems(prev => {
      const f = initialFrameForRestore(user_id)
      const maxZ = prev.reduce((m, it) => Math.max(m, it.z || 1), 1)
      const next = prev.map(x =>
        x.partner.user_id === user_id
          ? { ...x, minimized:false, x: f.x, y: f.y, w: f.w, h: f.h, z: maxZ + 1 }
          : x
      )
      savePos(user_id, f.x, f.y)
      saveSize(user_id, f.w, f.h)
      return next
    })
  }

  // Incoming message signal
  function handleIncoming({ partner, message, soundOn, notifyOn, active, minimized }) {
    if (soundOn) playPing()
    if (notifyOn && 'Notification' in window) {
      const can = Notification.permission
      const hidden = document.hidden
      const notActive = minimized || !active
      if ((hidden || notActive) && (can === 'granted' || can === 'default')) {
        if (can === 'default') {
          Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
              new Notification(`${partner.display_name || partner.handle || 'New message'}`, {
                body: message.body?.slice(0, 120) || 'New message',
              })
            }
          }).catch(()=>{})
        } else {
          try {
            new Notification(`${partner.display_name || partner.handle || 'New message'}`, {
              body: message.body?.slice(0, 120) || 'New message',
            })
          } catch {}
        }
      }
    }
  }

  if (!supabase) return null

  return (
    <div style={{ position:'fixed', top:0, left:0, width:'100vw', height:'100vh', zIndex: 9999, pointerEvents:'none' }}>
      {items.map(item => {
        const isActive = activeUserId === item.partner.user_id && !item.minimized
        const styleFixed = {
          position:'fixed',
          left: item.x,
          top: item.y,
          width: item.w || DEF_W,
          height: item.minimized ? 60 : (item.h || DEF_H),
          transform: item.minimized ? 'translateY(360px)' : 'none',
          transition: 'transform .18s ease',
          pointerEvents:'auto',
          zIndex: item.z || 1000
        }
        return (
          <div key={item.key} style={styleFixed}>
            {(item.unread > 0 && (item.minimized || !isActive)) && (
              <div style={{
                position:'absolute', top:-6, right:-6,
                minWidth:18, height:18, padding:'0 5px',
                background:'#E63946', color:'#fff', fontSize:12, fontWeight:700,
                borderRadius:999, display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:'0 1px 2px rgba(0,0,0,0.2)'
              }}>
                {item.unread > 99 ? '99+' : item.unread}
              </div>
            )}

            {/* Chat Window */}
            <ChatWindow
              me={me}
              partner={item.partner}
              active={isActive}
              minimized={item.minimized}
              onClose={() => closeFor(item.partner.user_id)}
              onMinimize={() => minimizeFor(item.partner.user_id)}
              onFocus={(uid) => setActiveUserId(uid)}
              onUnreadChange={(uid, count) => setUnread(uid, count)}
              onRestore={() => restoreFor(item.partner.user_id)}
              onIncoming={handleIncoming}
              inputAutoFocusRef={useRef(null)}
              width={item.w || DEF_W}
              height={item.h || DEF_H}
            />

            {/* Drag overlay */}
            <div
              onMouseDown={(e) => {
                const el = e.target.closest('.drag-handle')
                if (el) onDragStart(item.partner.user_id, e.clientX, e.clientY)
              }}
              onTouchStart={(e) => {
                const t = e.touches[0]
                const el = e.target.closest('.drag-handle')
                if (el && t) onDragStart(item.partner.user_id, t.clientX, t.clientY)
              }}
              style={{ position:'absolute', inset:0, pointerEvents:'none' }}
            />
            {/* Resize overlay */}
            <div
              onMouseDown={(e) => {
                const el = e.target.closest('.resize-handle')
                if (el) onResizeStart(item.partner.user_id, e.clientX, e.clientY)
              }}
              onTouchStart={(e) => {
                const t = e.touches[0]
                const el = e.target.closest('.resize-handle')
                if (el && t) onResizeStart(item.partner.user_id, t.clientX, t.clientY)
              }}
              style={{ position:'absolute', inset:0, pointerEvents:'none' }}
            />
          </div>
        )
      })}
    </div>
  )
}


