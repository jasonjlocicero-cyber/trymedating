import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock (Draggable + Resizable + Persisted + Snap-to-corners + Grid)
 * - Multiple draggable/resizable chat windows (cap 3)
 * - Positions & sizes saved per partner in localStorage
 * - Snap to nearest corner if released within threshold; otherwise snap to a 12px grid
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
const FOOTER_CLEAR = 120 // keep above footer
const GRID = 12          // grid size for alignment
const SNAP_THRESH = 40   // px distance to corner to trigger snap

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

// ---------- ChatWindow (UI) -------------------------------------------------

function ChatWindow({
  me, partner,
  active, minimized,
  onClose, onMinimize,
  onFocus,
  onUnreadChange,
  inputAutoFocusRef,
  width, height
}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [theirTyping, setTheirTyping] = useState(false)
  const inputRef = useRef(null)
  const bottomRef = useRef(null)
  const typingTimerRef = useRef(null)
  const lastTypingSentRef = useRef(0)

  useEffect(() => { if (inputAutoFocusRef) inputAutoFocusRef.current = inputRef.current }, [inputAutoFocusRef])

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
          .limit(100)
        if (error) throw error
        setMessages((data || []).reverse())
      } catch (e) {
        setError(e.message || 'Failed to load messages.')
      } finally {
        setLoading(false)
      }
    })()
  }, [me?.id, partner?.user_id])

  useEffect(() => {
    if (!me || !partner?.user_id) return
    const channel = supabase
      .channel(`realtime:dm:${partner.user_id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          const m = payload.new
          const isOurs =
            (m.sender === me.id && m.recipient === partner.user_id) ||
            (m.sender === partner.user_id && m.recipient === me.id)
          if (!isOurs) return
          setMessages(prev => [...prev, m])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [me?.id, partner?.user_id])

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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])
  useEffect(() => { if (active && !minimized) setTimeout(() => inputRef.current?.focus(), 0) }, [active, minimized])

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

  async function send() {
    if (!draft.trim() || !me || !partner?.user_id) return
    const body = draft.trim().slice(0, 2000)
    setDraft('')
    const { error } = await supabase.from('messages').insert({
      sender: me.id,
      recipient: partner.user_id,
      body
    })
    if (error) setError(error.message)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const avatar = partner?.avatar_url || 'https://via.placeholder.com/28?text=%F0%9F%98%8A'
  const name = partner?.display_name || partner?.handle || 'Unknown'

  return (
    <div
      onMouseDown={() => onFocus?.(partner.user_id)}
      style={{
        width, height, background:'#fff',
        border:'1px solid #ddd', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.08)',
        display:'flex', flexDirection:'column', overflow:'hidden'
      }}
    >
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
          <button onClick={onMinimize} title="Minimize" style={iconBtnStyle}>—</button>
          <button onClick={onClose} title="Close" style={iconBtnStyle}>×</button>
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:10, background:'#fafafa' }}>
        {loading && <div>Loading…</div>}
        {error && <div style={{ color:'#C0392B' }}>{error}</div>}
        {!loading && messages.length === 0 && <div style={{ opacity:.7 }}>Say hi 👋</div>}
        {messages.map(m => {
          const mine = m.sender === me?.id
          return (
            <div key={m.id} style={{ display:'flex', marginBottom:8, justifyContent: mine?'flex-end':'flex-start' }}>
              <div style={{
                maxWidth:'75%',
                background: mine ? '#2A9D8F' : '#fff',
                color: mine ? '#fff' : '#222',
                border: mine ? 'none' : '1px solid #eee',
                borderRadius:14, padding:'8px 12px'
              }}>
                <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{m.body}</div>
                <div style={{ fontSize:11, opacity:.7, marginTop:2 }}>{new Date(m.created_at).toLocaleTimeString()}</div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ minHeight: theirTyping ? 18 : 0, padding: theirTyping ? '0 10px 6px' : 0, fontSize: 12, color:'#7a7a7a' }}>
        {theirTyping ? `${partner?.display_name || partner?.handle || 'They'} is typing…` : null}
      </div>

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

// ---------- ChatDock (with persisted positions & size + snap) ---------------

export default function ChatDock() {
  const me = useMe()
  const [activeUserId, setActiveUserId] = useState(null)
  const [items, setItems] = useState([]) // [{ key, partner, minimized, unread, x, y, z, w, h }]
  const [profilesCache, setProfilesCache] = useState({})

  function emitStatus(updated = items) {
    window.dispatchEvent(new CustomEvent('chatdock:status', { detail: { open: updated.length > 0 } }))
    const totalUnread = updated.reduce((sum, x) => sum + (x.unread || 0), 0)
    window.dispatchEvent(new CustomEvent('chatdock:unread', { detail: { count: totalUnread } }))
  }
  useEffect(() => { emitStatus() }, [items])

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }
  function viewport() { return { w: window.innerWidth, h: window.innerHeight } }

  function loadPos(uid) {
    const raw = localStorage.getItem(`tmd_pos_${uid}`)
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }
  function savePos(uid, x, y) {
    localStorage.setItem(`tmd_pos_${uid}`, JSON.stringify({ x, y }))
  }

  function loadSize(uid) {
    const raw = localStorage.getItem(`tmd_size_${uid}`)
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }
  function saveSize(uid, w, h) {
    localStorage.setItem(`tmd_size_${uid}`, JSON.stringify({ w, h }))
  }

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

  // ------- SNAP HELPERS -----------------------------------------------------

  function snapToGrid(val, size, max) {
    // clamp, then round to nearest GRID
    const clamped = clamp(val, EDGE_GAP, max - EDGE_GAP - size)
    const snapped = Math.round(clamped / GRID) * GRID
    return clamp(snapped, EDGE_GAP, max - EDGE_GAP - size)
  }

  function cornerTargets({ vw, vh, w, h }) {
    return [
      { x: EDGE_GAP,                 y: EDGE_GAP },                                           // TL
      { x: vw - EDGE_GAP - w,        y: EDGE_GAP },                                           // TR
      { x: EDGE_GAP,                 y: vh - EDGE_GAP - FOOTER_CLEAR - h },                   // BL
      { x: vw - EDGE_GAP - w,        y: vh - EDGE_GAP - FOOTER_CLEAR - h }                    // BR
    ]
  }

  function distance(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y
    return Math.sqrt(dx*dx + dy*dy)
  }

  function snapPosition(x, y, w, h) {
    const { w: vw, h: vh } = viewport()
    const targets = cornerTargets({ vw, vh, w, h })
    const current = { x, y }
    let best = { ...current }, bestD = Infinity

    for (const t of targets) {
      const d = distance(current, t)
      if (d < bestD) { bestD = d; best = t }
    }

    if (bestD <= SNAP_THRESH) {
      // Snap to the closest corner
      return { x: best.x, y: best.y }
    }
    // Otherwise snap to grid
    const gx = snapToGrid(x, w, vw)
    const gy = snapToGrid(y, h, vh - FOOTER_CLEAR) // use reduced vertical max
    return { x: gx, y: gy }
  }

  // Global open()
  useEffect(() => {
    window.trymeChat = {
      open: async ({ handle, user_id } = {}) => {
        if (!supabase) return
        if (!me) { window.location.href = '/auth'; return }

        let prof = null
        if (user_id) {
          prof = profilesCache[user_id] || await fetchProfileByUserId(user_id)
        } else if (handle) {
          prof = await fetchProfileByHandle(handle)
        }
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

  // --- Drag logic (mouse + touch) ------------------------------------------
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
      const nx = clamp(dragRef.current.baseX + dx, minX, maxX)
      const ny = clamp(dragRef.current.baseY + dy, minY, maxY)
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

    // apply snap + persist
    setItems(prev => prev.map(x => {
      if (x.partner.user_id !== uid) return x
      const { x: sx, y: sy } = snapPosition(x.x, x.y, x.w || DEF_W, x.h || DEF_H)
      savePos(uid, sx, sy)
      return { ...x, x: sx, y: sy }
    }))
  }

  // --- Resize logic (mouse + touch) ----------------------------------------
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

    let nw = resizeRef.current.baseW + dx
    let nh = resizeRef.current.baseH + dy
    nw = clamp(nw, MIN_W, Math.min(MAX_W, vw - 2*EDGE_GAP))
    nh = clamp(nh, MIN_H, Math.min(MAX_H, vh - FOOTER_CLEAR - 2*EDGE_GAP))

    setItems(prev => prev.map(x => {
      if (x.partner.user_id !== resizeRef.current.uid) return x
      let nx = x.x
      let ny = x.y
      nx = clamp(nx, EDGE_GAP, vw - EDGE_GAP - nw)
      ny = clamp(ny, EDGE_GAP, vh - EDGE_GAP - FOOTER_CLEAR - nh)
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

            {/* Drag listeners on header */}
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
            >
              <ChatWindow
                me={me}
                partner={item.partner}
                active={isActive}
                minimized={item.minimized}
                onClose={() => closeFor(item.partner.user_id)}
                onMinimize={() => minimizeFor(item.partner.user_id)}
                onFocus={(uid) => focusFor(uid)}
                onUnreadChange={(uid, count) => setUnread(uid, count)}
                inputAutoFocusRef={useRef(null)}
                width={item.w || DEF_W}
                height={item.h || DEF_H}
              />
            </div>

            {/* Resize listeners on corner handle */}
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
