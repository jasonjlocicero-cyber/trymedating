import React, { useEffect, useRef, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock with Attachments
 * - Draggable/resizable chat windows (cap 3), persisted pos/size
 * - Snap-to-corners + grid, restore, pin, in-chat search, notifications
 * - NEW: Image/GIF attachments
 *   - Button + drag&drop
 *   - Preview before sending
 *   - Uploads to Supabase Storage (bucket 'attachments')
 *   - Public URLs saved into messages.attachment_url
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

// tiny ping sound
const PING_DATA_URL =
  'data:audio/wav;base64,UklGRkSXAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YUTWAQAAgP8AAP8AgAAAAP8A/4AAf/8AAP8A/4AAAP8AAAD/AAAA/wD/gAAf/8AAP8A/4AAAP8AAAD/AAAA/wD/gAB///8AAAD/gAAA'

function playPing() {
  try { const a = new Audio(PING_DATA_URL); a.volume = 0.35; a.play().catch(()=>{}) } catch {}
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

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function highlightText(text, query) {
  if (!query) return text
  const parts = []
  try {
    const re = new RegExp(escapeRegExp(query), 'ig')
    let lastIndex = 0, m
    while ((m = re.exec(text)) !== null) {
      const start = m.index, end = re.lastIndex
      if (start > lastIndex) parts.push(text.slice(lastIndex, start))
      parts.push(<mark key={start}>{text.slice(start, end)}</mark>)
      lastIndex = end
      if (m.index === re.lastIndex) re.lastIndex++
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts.length ? parts : text
  } catch { return text }
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

// ---------- ChatWindow ------------------------------------------------------

function ChatWindow({
  me, partner,
  active, minimized,
  onClose, onMinimize,
  onFocus,
  onUnreadChange,
  onRestore,
  onIncoming,
  onTogglePin,
  isPinned,
  inputAutoFocusRef,
  width, height
}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  const bottomRef = useRef(null)

  const [theirTyping, setTheirTyping] = useState(false)
  const typingTimerRef = useRef(null)
  const lastTypingSentRef = useRef(0)
  const lastAlertRef = useRef(0)

  // Search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const searchInputRef = useRef(null)

  // Notifications toggles
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

  // ATTACHMENTS state
  const [attachFile, setAttachFile] = useState(null)     // File
  const [attachPreview, setAttachPreview] = useState('') // blob URL
  const [isUploading, setIsUploading] = useState(false)
  const MAX_BYTES = 5 * 1024 * 1024 // 5MB
  const ACCEPT_TYPES = ['image/png','image/jpeg','image/jpg','image/gif','image/webp']

  function resetAttachment() {
    setAttachFile(null)
    if (attachPreview) URL.revokeObjectURL(attachPreview)
    setAttachPreview('')
  }

  // Unread tracking
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
          .select('id, sender, recipient, body, attachment_url, attachment_type, created_at')
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

  // Realtime
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

  // Keyboard shortcut: Ctrl/Cmd+F for search
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

  // Scroll/focus
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])
  useEffect(() => { if (active && !minimized) setTimeout(() => inputRef.current?.focus(), 0) }, [active, minimized])

  // Unread
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

  // Normalize for search/highlight
  const normalized = useMemo(() => {
    return messages.map(m => ({
      id: m.id,
      text: String(m.body || ''),
      mine: m.sender === me?.id,
      created_at: m.created_at,
      attachment_url: m.attachment_url || null,
      attachment_type: m.attachment_type || null
    }))
  }, [messages, me?.id])

  const matches = useMemo(() => {
    if (!searchQuery?.trim()) return []
    const re = new RegExp(escapeRegExp(searchQuery.trim()), 'i')
    const out = []
    normalized.forEach((row, idx) => { if (re.test(row.text)) out.push({ msgIdx: idx }) })
    return out
  }, [searchQuery, normalized])
  useEffect(() => {
    if (!matches.length) { setMatchIndex(0); return }
    setMatchIndex(i => Math.max(0, Math.min(i, matches.length - 1)))
  }, [matches.length])
  const msgRefs = useRef({})
  useEffect(() => {
    if (!matches.length) return
    const target = matches[matchIndex]
    const msg = normalized[target.msgIdx]
    const el = msgRefs.current[msg.id]
    if (el?.scrollIntoView) el.scrollIntoView({ behavior:'smooth', block:'center' })
  }, [matchIndex, matches, normalized])

  function gotoPrev() { if (matches.length) setMatchIndex(i => (i - 1 + matches.length) % matches.length) }
  function gotoNext() { if (matches.length) setMatchIndex(i => (i + 1) % matches.length) }

  // Attachment handlers
  function pickAttachment(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ACCEPT_TYPES.includes(file.type)) { setError('Unsupported file type. Use PNG/JPG/GIF/WebP.'); return }
    if (file.size > MAX_BYTES) { setError('File is too large. Max 5MB.'); return }
    setError('')
    setAttachFile(file)
    setAttachPreview(URL.createObjectURL(file))
  }

  function onDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!ACCEPT_TYPES.includes(file.type)) { setError('Unsupported file type. Use PNG/JPG/GIF/WebP.'); return }
    if (file.size > MAX_BYTES) { setError('File is too large. Max 5MB.'); return }
    setError('')
    setAttachFile(file)
    setAttachPreview(URL.createObjectURL(file))
  }
  function onDragOver(e){ e.preventDefault(); }

  async function uploadAttachmentIfAny() {
    if (!attachFile || !me?.id) return { url: null, type: null }
    setIsUploading(true)
    try {
      const cleanName = attachFile.name.replace(/[^\w.\-]+/g, '_')
      const path = `user_${me.id}/${Date.now()}_${cleanName}`
      const { error: upErr } = await supabase
        .storage
        .from('attachments')
        .upload(path, attachFile, { upsert: false, contentType: attachFile.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('attachments').getPublicUrl(path)
      if (!data?.publicUrl) throw new Error('Could not get public URL.')
      return { url: data.publicUrl, type: 'image' }
    } finally {
      setIsUploading(false)
      resetAttachment()
    }
  }

  async function send() {
    if ((!draft.trim()) && !attachFile) return
    if (!me || !partner?.user_id) return

    let body = draft.trim().slice(0, 2000)
    setDraft('')

    // Upload (if any)
    let attachment_url = null
    let attachment_type = null
    try {
      if (attachFile) {
        const res = await uploadAttachmentIfAny()
        attachment_url = res.url
        attachment_type = res.type
      }
    } catch (e) {
      setError(e.message || 'Upload failed.')
      return
    }

    const { error: insertErr } = await supabase.from('messages').insert({
      sender: me.id,
      recipient: partner.user_id,
      body: body || null,
      attachment_url,
      attachment_type
    })
    if (insertErr) setError(insertErr.message)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const avatar = partner?.avatar_url || 'https://via.placeholder.com/28?text=%F0%9F%98%8A'
  const name = partner?.display_name || partner?.handle || 'Unknown'

  return (
    <div
      onMouseDown={() => onFocus?.(partner.user_id)}
      onDrop={onDrop}
      onDragOver={onDragOver}
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
          {/* Pin */}
          <button onClick={onTogglePin} title={isPinned ? 'Unpin' : 'Pin chat'} style={{ ...iconBtnStyle, background: isPinned ? '#ffeac1' : '#fff' }}>
            {isPinned ? '📌' : '📍'}
          </button>
          {/* Search */}
          <button onClick={() => { setSearchOpen(v=>!v); setTimeout(()=>searchInputRef.current?.focus(),0) }} title="Search (Ctrl/⌘+F)" style={iconBtnStyle}>🔎</button>
          {/* Sound */}
          <button onClick={() => { const v = !soundOn; setSoundOn(v); persistSound(v) }} title={soundOn?'Mute':'Enable sound'} style={iconBtnStyle}>
            {soundOn ? '🔔' : '🔕'}
          </button>
          {/* Desktop notifications */}
          <button
            onClick={async () => {
              const v = !notifyOn
              setNotifyOn(v); persistNotify(v)
              if (v && 'Notification' in window && Notification.permission === 'default') {
                try { await Notification.requestPermission() } catch {}
              }
            }}
            title={notifyOn?'Disable desktop notifications':'Enable desktop notifications'}
            style={iconBtnStyle}
          >
            {notifyOn ? '🖥️' : '🚫'}
          </button>
          {/* Restore / Min / Close */}
          <button onClick={onRestore} title="Restore size & position" style={iconBtnStyle}>↺</button>
          <button onClick={onMinimize} title="Minimize" style={iconBtnStyle}>—</button>
          <button onClick={onClose} title={isPinned ? 'Close (pinned—will reopen next load)' : 'Close'} style={iconBtnStyle}>×</button>
        </div>
      </div>

      {/* Search bar */}
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
        {!loading && messages.length === 0 && <div style={{ opacity:.7 }}>Say hi 👋 (Tip: drag an image/GIF here to attach)</div>}
        {normalized.map((row, idx) => {
          const mine = row.mine
          const isCurrent = matches.length && matches[matchIndex]?.msgIdx === idx
          return (
            <div key={row.id} ref={el => { msgRefs.current[row.id] = el }} style={{ display:'flex', marginBottom:8, justifyContent: mine?'flex-end':'flex-start' }}>
              <div style={{
                maxWidth:'75%',
                background: mine ? '#2A9D8F' : '#fff',
                color: mine ? '#fff' : '#222',
                border: mine ? 'none' : '1px solid #eee',
                borderRadius:14, padding:'8px 12px',
                outline: isCurrent ? '2px solid #2A9D8F' : 'none'
              }}>
                {/* Attachment first if any */}
                {row.attachment_url && row.attachment_type === 'image' && (
                  <a href={row.attachment_url} target="_blank" rel="noreferrer" style={{ display:'block', marginBottom: row.text ? 8 : 0 }}>
                    <img
                      src={row.attachment_url}
                      alt="attachment"
                      style={{ maxWidth:'100%', borderRadius:10, display:'block' }}
                      loading="lazy"
                    />
                  </a>
                )}
                {/* Text (with highlights) */}
                {row.text && (
                  <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                    {highlightText(row.text, searchQuery)}
                  </div>
                )}
                <div style={{ fontSize:11, opacity:.7, marginTop:6 }}>
                  {new Date(row.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Typing */}
      <div style={{ minHeight: theirTyping ? 18 : 0, padding: theirTyping ? '0 10px 6px' : 0, fontSize: 12, color:'#7a7a7a' }}>
        {theirTyping ? `${partner?.display_name || partner?.handle || 'They'} is typing…` : null}
      </div>

      {/* Composer + Attach */}
      <div style={{ borderTop:'1px solid #eee', padding:8, display:'flex', gap:6, background:'#fff', alignItems:'center' }}>
        {/* Attach file */}
        <label style={{ ...iconBtnStyle, width:36, height:36, display:'inline-flex', alignItems:'center', justifyContent:'center' }} title="Attach image (PNG/JPG/GIF/WebP)">
          📎
          <input type="file" accept={ACCEPT_TYPES.join(',')}
            onChange={pickAttachment}
            style={{ display:'none' }}
          />
        </label>

        {/* If previewing an attachment, show it */}
        {attachPreview && (
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f8f8f8', border:'1px solid #eee', borderRadius:8, padding:'4px 6px' }}>
            <img src={attachPreview} alt="preview" style={{ width:40, height:40, objectFit:'cover', borderRadius:6, border:'1px solid #ddd' }} />
            <button onClick={resetAttachment} style={{ ...smallBtn }}>Remove</button>
            {isUploading && <span style={{ fontSize:12, opacity:.7 }}>Uploading…</span>}
          </div>
        )}

        {/* Text input */}
        <input
          ref={inputRef}
          value={draft}
          onChange={e=>{ setDraft(e.target.value); sendTypingSignal() }}
          onKeyDown={e=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send() } }}
          placeholder={attachFile ? 'Add a caption…' : 'Type a message… (or drop an image here)'}
          style={{ flex:1, padding:10, borderRadius:10, border:'1px solid #ddd' }}
        />
        <button
          onClick={send}
          disabled={(!draft.trim() && !attachFile) || isUploading}
          style={{ padding:'8px 12px', border:'none', borderRadius:10, background:'#2A9D8F', color:'#fff', fontWeight:700 }}
        >
          Send
        </button>
      </div>

      {/* Resize handle */}
      <div
        className="resize-handle"
        title="Drag to resize"
        style={{ position:'absolute', right:6, bottom:6, width:14, height:14, borderRight:'2px solid #bbb', borderBottom:'2px solid #bbb', cursor:'nwse-resize', opacity:.8 }}
      />
    </div>
  )
}

// ---------- ChatDock (manager) ---------------------------------------------

export default function ChatDock() {
  const me = useMe()
  const [activeUserId, setActiveUserId] = useState(null)
  const [items, setItems] = useState([]) // [{ key, partner, minimized, unread, x, y, z, w, h, pinned }]
  const [profilesCache, setProfilesCache] = useState({})
  const pinnedInitRef = useRef(false)

  function emitStatus(updated = items) {
    window.dispatchEvent(new CustomEvent('chatdock:status', { detail: { open: updated.length > 0 } }))
    const totalUnread = updated.reduce((sum, x) => sum + (x.unread || 0), 0)
    window.dispatchEvent(new CustomEvent('chatdock:unread', { detail: { count: totalUnread } }))
  }
  useEffect(() => { emitStatus() }, [items])

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }
  function viewport() { return { w: window.innerWidth, h: window.innerHeight } }

  function loadPos(uid) { try { return JSON.parse(localStorage.getItem(`tmd_pos_${uid}`) || 'null') } catch { return null } }
  function savePos(uid, x, y) { localStorage.setItem(`tmd_pos_${uid}`, JSON.stringify({ x, y })) }
  function loadSize(uid) { try { return JSON.parse(localStorage.getItem(`tmd_size_${uid}`) || 'null') } catch { return null } }
  function saveSize(uid, w, h) { localStorage.setItem(`tmd_size_${uid}`, JSON.stringify({ w, h })) }
  function isPinned(uid) { try { return localStorage.getItem(`tmd_pin_${uid}`) === '1' } catch { return false } }
  function setPinned(uid, on) { try { localStorage.setItem(`tmd_pin_${uid}`, on ? '1' : '0') } catch {} }
  function getPinnedIds() {
    const ids = []
    try {
      for (let i=0; i<localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('tmd_pin_') && localStorage.getItem(k) === '1') {
          const uid = k.replace('tmd_pin_', '')
          if (uid) ids.push(uid)
        }
      }
    } catch {}
    return ids
  }

  function initialFrame(index, uid) {
    const pos = loadPos(uid)
    const size = loadSize(uid)
    const { w: vw, h: vh } = viewport()
    const xDefault = vw - EDGE_GAP - DEF_W - index * (DEF_W + 12)
    const yDefault = vh - EDGE_GAP - FOOTER_CLEAR - DEF_H
    const x = pos?.x ?? Math.max(EDGE_GAP, xDefault)
    const y = pos?.y ?? Math.max(EDGE_GAP, yDefault)
    const w = Math.max(MIN_W, Math.min(Math.min(MAX_W, vw - 2*EDGE_GAP), size?.w ?? DEF_W))
    const h = Math.max(MIN_H, Math.min(Math.min(MAX_H, vh - FOOTER_CLEAR - 2*EDGE_GAP), size?.h ?? DEF_H))
    return { x, y, w, h }
  }

  function snapToGrid(val, size, max) {
    const clamped = Math.max(EDGE_GAP, Math.min(max - EDGE_GAP - size, val))
    const snapped = Math.round(clamped / GRID) * GRID
    return Math.max(EDGE_GAP, Math.min(max - EDGE_GAP - size, snapped))
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
            z: maxZ + 1,
            pinned: isPinned(prof.user_id)
          }]
          setActiveUserId(prof.user_id)
          emitStatus(next)
          return next.slice(-3)
        })
      }
    }
    return () => { delete window.trymeChat }
  }, [me, profilesCache])

  // Auto-open pinned on mount
  useEffect(() => {
    if (!me || pinnedInitRef.current) return
    pinnedInitRef.current = true
    ;(async () => {
      const ids = getPinnedIds()
      if (!ids.length) return
      const proms = ids.map(uid => fetchProfileByUserId(uid))
      const profs = (await Promise.all(proms)).filter(Boolean)
      setProfilesCache(prev => Object.assign({}, prev, ...profs.map(p => ({ [p.user_id]: p }))))
      setItems(prev => {
        const base = [...prev]
        let maxZ = base.reduce((m, it) => Math.max(m, it.z || 1), 1)
        for (let i = 0; i < profs.length; i++) {
          const p = profs[i]
          if (base.find(x => x.partner.user_id === p.user_id)) continue
          const f = initialFrame(i, p.user_id)
          base.push({
            key: `w-${p.user_id}`,
            partner: p,
            minimized:false,
            unread:0,
            x: f.x, y: f.y, w: f.w, h: f.h,
            z: ++maxZ,
            pinned: true
          })
        }
        emitStatus(base)
        return base.slice(-3)
      })
    })()
  }, [me])

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

  // drag
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

  // resize
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

  // restore default frame
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

  function togglePin(user_id) {
    setItems(prev => prev.map(x => {
      if (x.partner.user_id !== user_id) return x
      const nextPinned = !x.pinned
      setPinned(user_id, nextPinned)
      return { ...x, pinned: nextPinned }
    }))
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
              onTogglePin={() => togglePin(item.partner.user_id)}
              isPinned={!!item.pinned}
              inputAutoFocusRef={useRef(null)}
              width={item.w || DEF_W}
              height={item.h || DEF_H}
            />

            {/* Drag & Resize overlays */}
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


