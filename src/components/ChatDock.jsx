import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock
 * - Fixed dock at bottom-right
 * - Manage multiple ChatWindow popups
 * - Exposes window.trymeChat.open({ handle? , user_id? })
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

function ChatWindow({ me, partner, onClose, onMinimize }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const bottomRef = useRef(null)

  // Initial load
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
  }, [me, partner?.user_id])

  // Realtime subscription for this pair
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
  }, [me, partner?.user_id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

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
  }

  const avatar = partner?.avatar_url || 'https://via.placeholder.com/28?text=%F0%9F%98%8A'
  const name = partner?.display_name || partner?.handle || 'Unknown'

  return (
    <div style={{
      width: 320, height: 420, background:'#fff',
      border:'1px solid #ddd', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.08)',
      display:'flex', flexDirection:'column', overflow:'hidden'
    }}>
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

      {/* Composer */}
      <div style={{ borderTop:'1px solid #eee', padding:8, display:'flex', gap:6 }}>
        <input
          value={draft}
          onChange={e=>setDraft(e.target.value)}
          onKeyDown={e=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send() } }}
          placeholder="Type a message…"
          style={{ flex:1, padding:10, borderRadius:10, border:'1px solid #ddd' }}
        />
        <button onClick={send} disabled={!draft.trim()} style={{ padding:'8px 12px', border:'none', borderRadius:10, background:'#2A9D8F', color:'#fff', fontWeight:700 }}>
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

export default function ChatDock() {
  const me = useMe()
  const [items, setItems] = useState([]) // [{key, partner, minimized}]
  const [profilesCache, setProfilesCache] = useState({}) // user_id -> profile

  // Expose a global open() helper so any page can open chats
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
          // Already open? Un-minimize and bring to front
          const exists = prev.find(x => x.partner.user_id === prof.user_id)
          if (exists) {
            return prev.map(x => x.partner.user_id === prof.user_id ? { ...x, minimized:false } : x)
          }
          // Max 3 windows → drop the oldest
          const next = [...prev, { key: `w-${prof.user_id}`, partner: prof, minimized:false }]
          return next.slice(-3)
        })
      }
    }
    return () => { delete window.trymeChat }
  }, [me, profilesCache])

  function closeFor(user_id) {
    setItems(prev => prev.filter(x => x.partner.user_id !== user_id))
  }
  function minimizeFor(user_id) {
    setItems(prev => prev.map(x => x.partner.user_id === user_id ? { ...x, minimized:!x.minimized } : x))
  }

  if (!supabase) return null

  return (
    <div style={{
      position:'fixed', right:16, bottom:16, display:'flex', gap:12, zIndex: 50
    }}>
      {items.map(item => (
        <div key={item.key} style={{ transform: item.minimized ? 'translateY(360px)' : 'translateY(0)', transition:'transform .18s ease' }}>
          <ChatWindow
            me={me}
            partner={item.partner}
            onClose={() => closeFor(item.partner.user_id)}
            onMinimize={() => minimizeFor(item.partner.user_id)}
          />
        </div>
      ))}
    </div>
  )
}
