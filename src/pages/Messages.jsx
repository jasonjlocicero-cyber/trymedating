import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Messages() {
  const { handle: routeHandle } = useParams()
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [allMsgs, setAllMsgs] = useState([])
  const [partners, setPartners] = useState({})
  const [activeId, setActiveId] = useState(null)
  const [draft, setDraft] = useState('')
  const bottomRef = useRef(null)

  if (!supabase) return <div style={{ padding: 40 }}>Supabase not configured.</div>

  useEffect(() => { document.title = 'Messages • TryMeDating' }, [])

  // 1) Require auth
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth'; return }
      setMe(user)
    })()
  }, [])

  // 2) Load recent messages that involve me
  useEffect(() => {
    if (!me) return
    ;(async () => {
      try {
        setLoading(true); setError('')
        const { data, error } = await supabase
          .from('messages')
          .select('id, sender, recipient, body, created_at')
          .or(`sender.eq.${me.id},recipient.eq.${me.id}`)
          .order('created_at', { ascending: false })
          .limit(400)
        if (error) throw error
        setAllMsgs(data || [])

        // Preload partner profiles
        const ids = new Set()
        ;(data || []).forEach(m => {
          const other = m.sender === me.id ? m.recipient : m.sender
          ids.add(other)
        })
        if (ids.size) {
          const arr = Array.from(ids)
          const { data: profs, error: e2 } = await supabase
            .from('profiles')
            .select('user_id, handle, display_name, avatar_url, is_public, mode')
            .in('user_id', arr)
          if (e2) throw e2
          const map = {}
          for (const p of (profs || [])) map[p.user_id] = p
          setPartners(map)
        } else {
          setPartners({})
        }
      } catch (e) {
        setError(e.message || 'Failed to load messages.')
      } finally {
        setLoading(false)
      }
    })()
  }, [me])

  // 3) Realtime subscription: append and ensure partner profile exists
  useEffect(() => {
    if (!me) return
    const channel = supabase
      .channel('realtime:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
        const m = payload.new
        // Only care about messages involving me
        if (m.sender !== me.id && m.recipient !== me.id) return

        // Append immediately
        setAllMsgs(prev => [m, ...prev])

        // Determine the "other" user
        const other = m.sender === me.id ? m.recipient : m.sender

        // If we don't have their profile yet, fetch it once
        if (!partners[other]) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('user_id, handle, display_name, avatar_url, is_public, mode')
            .eq('user_id', other)
            .maybeSingle()
          if (prof) {
            setPartners(prev => ({ ...prev, [other]: prof }))
          }
        }

        // If we currently have no active chat selected, auto-open this one
        setActiveId(prev => prev ?? other)
        const h = partners[other]?.handle || (await (async () => {
          const { data: prof } = await supabase
            .from('profiles')
            .select('handle')
            .eq('user_id', other)
            .maybeSingle()
          return prof?.handle
        })())
        if (h) nav(`/messages/${encodeURIComponent(h)}`, { replace: true })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [me, partners, nav])

  // 4) Deep-linked handle → resolve and select
  useEffect(() => {
    if (!me) return
    ;(async () => {
      if (!routeHandle) return
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_url, is_public, mode')
        .eq('handle', routeHandle.toLowerCase())
        .maybeSingle()
      if (!data || error) return
      setPartners(p => ({ ...p, [data.user_id]: data }))
      setActiveId(data.user_id)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeHandle, me])

  // 5) Build thread list
  const threads = useMemo(() => {
    const lastByPartner = new Map()
    for (const m of allMsgs) {
      const other = m.sender === me?.id ? m.recipient : m.sender
      if (!other) continue
      if (!lastByPartner.has(other)) lastByPartner.set(other, m) // newest first
    }
    if (activeId && !lastByPartner.has(activeId)) lastByPartner.set(activeId, null)
    const arr = Array.from(lastByPartner.entries()).map(([partnerId, last]) => ({
      partnerId,
      lastAt: last?.created_at || '1970-01-01T00:00:00Z',
      lastBody: last?.body || ''
    }))
    arr.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
    return arr
  }, [allMsgs, me, activeId])

  // 5.5) Auto-open latest when landing on /messages with no selection
  useEffect(() => {
    if (!routeHandle && !activeId && threads.length > 0) {
      setActiveId(threads[0].partnerId)
      const h = partners[threads[0].partnerId]?.handle
      if (h) nav(`/messages/${encodeURIComponent(h)}`, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.length, routeHandle, activeId])

  // 6) Active chat messages (oldest-first)
  const activeMsgs = useMemo(() => {
    if (!activeId) return []
    return allMsgs
      .filter(m => (m.sender === activeId && m.recipient === me?.id) || (m.sender === me?.id && m.recipient === activeId))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [allMsgs, activeId, me])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [activeMsgs.length])

  async function send() {
    if (!draft.trim() || !me || !activeId) return
    const body = draft.trim().slice(0, 2000)
    setDraft('')
    const { error } = await supabase.from('messages').insert({
      sender: me.id,
      recipient: activeId,
      body
    })
    if (error) setError(error.message)
  }

  function avatarOf(uid) { return partners[uid]?.avatar_url || 'https://via.placeholder.com/40?text=%F0%9F%98%8A' }
  function nameOf(uid) { return partners[uid]?.display_name || partners[uid]?.handle || 'Unknown' }
  function handleOf(uid) { return partners[uid]?.handle || 'unknown' }

  return (
    <div style={{ height: 'calc(100vh - 120px)', display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0 }}>
      {/* Sidebar */}
      <div style={{ borderRight: '1px solid #eee', overflow: 'auto' }}>
        <div style={{ padding: '16px 12px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <strong>Messages</strong>
        </div>

        {loading && <div style={{ padding: 12 }}>Loading…</div>}
        {error && <div style={{ padding: 12, color: '#C0392B' }}>{error}</div>}
        {!loading && threads.length === 0 && (
          <div style={{ padding: 12, opacity: .7 }}>No conversations yet. Start one from a profile.</div>
        )}

        {threads.map(t => (
          <div
            key={t.partnerId}
            onClick={() => { setActiveId(t.partnerId); nav(`/messages/${encodeURIComponent(handleOf(t.partnerId))}`, { replace: true }) }}
            style={{
              display: 'flex', gap: 10, alignItems: 'center',
              padding: '10px 12px', cursor: 'pointer',
              background: activeId === t.partnerId ? '#F8FAFB' : '#fff'
            }}
          >
            <img src={avatarOf(t.partnerId)} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{nameOf(t.partnerId)}</div>
              <div style={{ fontSize: 12, opacity: .8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.lastBody}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chat pane */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #eee', display: 'flex', gap: 10, alignItems: 'center' }}>
          {activeId ? (
            <>
              <img src={avatarOf(activeId)} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee' }} />
              <div style={{ fontWeight: 700 }}>
                <Link to={`/u/${encodeURIComponent(handleOf(activeId))}`} style={{ textDecoration: 'none', color: '#222' }}>
                  {nameOf(activeId)} <span style={{ opacity:.7, fontWeight:400 }}>@{handleOf(activeId)}</span>
                </Link>
              </div>
            </>
          ) : (
            <div style={{ opacity: .7 }}>Pick a conversation on the left.</div>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#fafafa' }}>
          {activeId ? (
            activeMsgs.length ? activeMsgs.map(m => {
              const mine = m.sender === me?.id
              return (
                <div key={m.id} style={{ display: 'flex', marginBottom: 8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '70%',
                    background: mine ? '#2A9D8F' : '#fff',
                    color: mine ? '#fff' : '#222',
                    border: mine ? 'none' : '1px solid #eee',
                    borderRadius: 14,
                    padding: '8px 12px',
                    boxShadow: mine ? 'none' : '0 1px 0 rgba(0,0,0,0.03)'
                  }}>
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                    <div style={{ fontSize: 11, opacity: .7, marginTop: 2 }}>
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              )
            }) : (
              <div style={{ opacity: .7 }}>Say hi 👋</div>
            )
          ) : null}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div style={{ padding: 12, borderTop: '1px solid #eee', display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={activeId ? 'Type a message…' : 'Select a conversation first'}
            disabled={!activeId}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #ddd' }}
          />
          <button onClick={send} disabled={!activeId || !draft.trim()} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: '#2A9D8F', color: '#fff', fontWeight: 700 }}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
