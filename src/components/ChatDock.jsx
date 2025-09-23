import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock (QoL + Typing Indicators)
 * - Multiple pop-up chat windows (up to 3)
 * - Auto-focus input when active & visible
 * - Unread badges via localStorage last-read markers
 * - Typing indicators via Supabase Realtime Broadcast channels
 * - Emits:
 *   - 'chatdock:status'  { open: boolean }
 *   - 'chatdock:unread'  { count: number }
 * - Global helper: window.trymeChat.open({ handle, user_id })
 */

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

// ---------- ChatWindow ------------------------------------------------------

function ChatWindow({
  me, partner,
  active, minimized,
  onClose, onMinimize,
  onFocus,                // tell parent this window became active
  onUnreadChange          // (partnerId, unreadCount) -> void
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

  const lastReadKey = me && partner
    ? `tmd_last_read_${me.id}_${partner.user_id}`
    : null

  // Helpers: read/write last-read timestamp
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
          .limit(100)
        if (error) throw error
        setMessages((data || []).reverse()) // oldest first
      } catch (e) {
        setError(e.message || 'Failed to load messages.')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, partner?.user_id])

  // Realtime: DB inserts for this pair
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

  // Realtime: Typing indicator via Broadcast channel (no SQL)
  useEffect(() => {
    if (!me?.id || !partner?.user_id) return
    // Stable room name for both sides (sorted UUIDs)
    const [a, b] = [me.id, partner.user_id].sort()
    const room = `typing:${a}:${b}`

    const channel = supabase.channel(room)
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { from, to } = payload.payload || {}
        if (from === partner.user_id && to === me.id) {
          // they are typing to me
          setTheirTyping(true)
          // auto-clear after 3s of silence
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

  // Send "typing" broadcast (throttled) when I type
  async function sendTypingSignal() {
    if (!me?.id || !partner?.user_id) return
    const now = Date.now()
    if (now - lastTypingSentRef.current < 800) return // throttle to ~0.8s
    lastTypingSentRef.current = now
    const [a, b] = [me.id, partner.user_id].sort()
    const room = `typing:${a}:${b}`
    await supabase.channel(room).send({
      type: 'broadcast',
      event: 'typing',
      payload: { from: me.id, to: partner.user_id }
    })
  }

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Auto-focus when active & not minimized
  useEffect(() => {
    if (active && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [active, minimized])

  // Unread computation & mark-as-read when visible
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
      if (unread > 0) {
        markReadNow()
        onUnreadChange?.(partner.user_id, 0)
      } else {
        onUnreadChange?.(partner.user_id, 0)
      }
    } else {
      onUnreadChange?.(partner.user_id, unread)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // keep focus for fast typing
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const avatar = partner?.avatar_url || 'https://via.placeholder.com/28?text=%F0%9F%98%8A'
  const name = partner?.display_name || partner?.handle || 'Unknown'

  return (
    <div
      onMouseDown={() => onFocus?.(partner.user_id)}
      style={{
        width: 320, height: 420, background:'#fff',
        border:'1px solid #ddd', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.08)',
        display:'flex', flexDirection:'column', overflow:'hidden'
      }}
    >
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', borderBottom:'1px solid #eee', background:'#f9fafb' }}>
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

      {/* Messages */}
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
    </div>
  )
}

const iconBtnStyle = {
  width:28, height:28,
  border:'1px solid #ddd', borderRadius:8, background:'#fff',
  cursor:'pointer', lineHeight:'24px', textAlign:'center'
}

// ---------- ChatDock --------------------------------------------------------

export default function ChatDock() {
  const me = useMe()
  const [activeUserId, setActiveUserId] = useState(null)
  const [items, setItems] = useState([]) // [{key, partner, minimized, unread}]
  const [profilesCache, setProfilesCache] = useState({}) // user_id -> profile

  // Emit status + unread for navbar badge/footer hiding
  function emitStatus() {
    window.dispatchEvent(new CustomEvent('chatdock:status', { detail: { open: items.length > 0 } }))
    const totalUnread = items.reduce((sum, x) => sum + (x.unread || 0), 0)
    window.dispatchEvent(new CustomEvent('chatdock:unread', { detail: { count: totalUnread } }))
  }
  useEffect(() => { emitStatus() }, [items.length])
  useEffect(() => { emitStatus() }, [items.map(i => i.unread).join(',')])

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
            const updated = prev.map(x =>
              x.partner.user_id === prof.user_id ? { ...x, minimized:false } : x
            )
            setActiveUserId(prof.user_id)
            return updated
          }
          const next = [...prev, { key: `w-${prof.user_id}`, partner: prof, minimized:false, unread:0 }]
          setActiveUserId(prof.user_id)
          return next.slice(-3) // cap at 3 windows
        })
      }
    }
    return () => { delete window.trymeChat }
  }, [me, profilesCache])

  function closeFor(user_id) {
    setItems(prev => prev.filter(x => x.partner.user_id !== user_id))
    if (activeUserId === user_id) setActiveUserId(null)
  }
  function minimizeFor(user_id) {
    setItems(prev => prev.map(x => x.partner.user_id === user_id ? { ...x, minimized:!x.minimized } : x))
  }
  function focusFor(user_id) {
    setActiveUserId(user_id)
    setItems(prev => prev.map(x => x.partner.user_id === user_id ? { ...x, minimized:false } : x))
  }
  function setUnread(partnerId, count) {
    setItems(prev => prev.map(x => x.partner.user_id === partnerId ? { ...x, unread: count } : x))
  }

  if (!supabase) return null

  return (
    <div style={{
      position:'fixed',
      right:16,
      bottom: 'calc(env(safe-area-inset-bottom) + 120px)', // lifted above footer
      display:'flex',
      gap:12,
      zIndex: 9999
    }}>
      {items.map(item => {
        const isActive = activeUserId === item.partner.user_id && !item.minimized
        return (
          <div
            key={item.key}
            style={{
              position:'relative',
              transform: item.minimized ? 'translateY(360px)' : 'translateY(0)',
              transition:'transform .18s ease'
            }}
          >
            {/* Unread badge (shows when minimized OR not active) */}
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
              onFocus={(uid) => focusFor(uid)}
              onUnreadChange={(uid, count) => setUnread(uid, count)}
            />
          </div>
        )
      })}
    </div>
  )
}

