// src/components/ChatLauncher.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import ChatDock from './ChatDock'
// NOTE: removed the stray top-level <button> that was outside any component

/* Tiny unread badge overlay */
function UnreadBadge({ count }) {
  if (!Number.isFinite(count) || count <= 0) return null
  const txt = count > 99 ? '99+' : String(count)
  return (
    <span
      title={`${count} unread`}
      style={{
        position: 'absolute',
        top: -4,
        right: -4,
        minWidth: 20,
        height: 20,
        padding: '0 6px',
        display: 'grid',
        placeItems: 'center',
        borderRadius: 9999,
        background: '#ef4444',
        color: '#fff',
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1,
        boxShadow: '0 0 0 2px #fff',
        pointerEvents: 'none'
      }}
    >
      {txt}
    </span>
  )
}

export default function ChatLauncher({ onUnreadChange = () => {} }) {
  const [me, setMe] = useState(null)
  const [open, setOpen] = useState(false)
  const [partnerId, setPartnerId] = useState(null)
  const [partnerName, setPartnerName] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [recent, setRecent] = useState([])
  const [err, setErr] = useState('')
  const [unread, setUnread] = useState(0) // ← NEW: local unread for badge

  // ------- auth -------
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setMe(user || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null)
    })
    return () => {
      alive = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  // ------- helper: load a display name/handle for a user id -------
  async function fetchProfileName(userId) {
    if (!userId) return ''
    // Adjust column names if your profiles schema differs
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, handle, user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) return ''
    return data.display_name || (data.handle ? `@${data.handle}` : '')
  }

  // ------- global opener + event -------
  useEffect(() => {
    function openFromEvent(ev) {
      const d = ev?.detail || {}
      if (d.partnerId) {
        setPartnerId(d.partnerId)
        setPartnerName(d.partnerName || '')
      }
      setOpen(true)
    }
    window.addEventListener('open-chat', openFromEvent)
    window.openChat = function (id, name = '') {
      if (id) {
        setPartnerId(id)
        setPartnerName(name || '')
      }
      setOpen(true)
    }
    return () => window.removeEventListener('open-chat', openFromEvent)
  }, [])

  // ------- realtime: auto-open when I receive a connection request (QR flow) -------
  useEffect(() => {
    if (!me?.id) return
    const ch = supabase
      .channel(`cr-autoopen-${me.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'connection_requests' },
        async payload => {
          const r = payload?.new
          if (!r) return
          // If I'm the recipient of a pending connection, open chat focused on requester
          if (r.recipient === me.id && r.status === 'pending') {
            const name = await fetchProfileName(r.requester)
            setPartnerId(r.requester)
            setPartnerName(name || '')
            setOpen(true)
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [me?.id])

  // ------- recent list when open -------
  useEffect(() => {
    let cancel = false
    async function loadRecent() {
      if (!open || !me?.id) return
      setLoadingList(true); setErr('')
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('sender, recipient, created_at')
          .or(`sender.eq.${me.id},recipient.eq.${me.id}`)
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) throw error

        const seen = new Set()
        const order = []
        for (const m of data || []) {
          const other = m.sender === me.id ? m.recipient : m.sender
          if (other && !seen.has(other)) { seen.add(other); order.push(other) }
          if (order.length >= 12) break
        }
        if (!order.length) { if (!cancel) setRecent([]); return }

        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, display_name, handle')
          .in('user_id', order)
        if (pErr) throw pErr

        const rank = new Map(order.map((id, i) => [id, i]))
        const list = (profs || [])
          .map(p => ({ id: p.user_id, display_name: p.display_name || '', handle: p.handle || '' }))
          .sort((a,b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))

        if (!cancel) setRecent(list)
      } catch (e) {
        if (!cancel) setErr(e.message || 'Failed to load conversations')
      } finally {
        if (!cancel) setLoadingList(false)
      }
    }
    loadRecent()
    return () => { cancel = true }
  }, [open, me?.id])

  // ------- unread count (fixed to use Supabase 'count') -------
  async function computeUnread(userId) {
    if (!userId) { setUnread(0); onUnreadChange(0); return }
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient', userId)
      .is('read_at', null)
    if (error) { setUnread(0); onUnreadChange(0); return }
    const n = count || 0
    setUnread(n)
    onUnreadChange(n)
  }

  // On mount + when user changes, do a lightweight unread recalc
  useEffect(() => {
    computeUnread(me?.id)
  }, [me?.id])

  // Live updates: subscribe to messages table to update unread in real-time
  useEffect(() => {
    if (!me?.id) return
    const channel = supabase
      .channel(`messages-unread-${me.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => computeUnread(me.id)
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [me?.id])

  const canChat = !!(me?.id && partnerId)

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Messages"
        aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
        style={{
          position:'fixed', right:16, bottom:16,
          width:56, height:56, borderRadius:'50%',
          border:'1px solid var(--border)', background:'#fff',
          boxShadow:'0 10px 24px rgba(0,0,0,0.12)',
          display:'grid', placeItems:'center', zIndex: 1000, cursor:'pointer'
        }}
      >
        <span style={{ fontSize:24 }}>💬</span>
        {/* NEW: unread badge */}
        <UnreadBadge count={unread} />
      </button>

      {/* Inbox picker */}
      {open && !partnerId && (
        <div
          style={{
            position:'fixed', right:16, bottom:80, width:320, maxWidth:'calc(100vw - 24px)',
            background:'#fff', border:'1px solid var(--border)', borderRadius:12,
            boxShadow:'0 12px 32px rgba(0,0,0,0.12)', padding:12, zIndex:1001
          }}
        >
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontWeight:800 }}>Messages</div>
            <button className="btn btn-neutral" onClick={() => setOpen(false)} style={{ padding:'4px 8px' }}>✕</button>
          </div>

          {!me?.id && <div className="helper-error">Sign in to message.</div>}

          {me?.id && (
            <>
              <div className="helper-muted" style={{ marginBottom:8 }}>Pick a recent chat:</div>
              {err && <div className="helper-error" style={{ marginBottom:8 }}>{err}</div>}
              {loadingList && <div className="muted">Loading…</div>}
              {!loadingList && recent.length === 0 && (
                <div className="muted">No conversations yet. Open someone’s profile to start a chat.</div>
              )}
              <ul style={{ listStyle:'none', padding:0, margin:0, maxHeight:220, overflowY:'auto' }}>
                {recent.map(p => (
                  <li key={p.id}>
                    <button
                      className="btn btn-neutral"
                      style={{ width:'100%', justifyContent:'flex-start', marginBottom:6 }}
                      onClick={() => {
                        setPartnerId(p.id)
                        setPartnerName(p.display_name || (p.handle ? `@${p.handle}` : 'Friend'))
                      }}
                    >
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <div style={{
                          width:24, height:24, borderRadius:'50%',
                          background:'#eef2f7', display:'grid', placeItems:'center',
                          fontSize:12, fontWeight:700
                        }}>
                          {(p.display_name || p.handle || '?').slice(0,1).toUpperCase()}
                        </div>
                        <div style={{ textAlign:'left' }}>
                          <div style={{ fontWeight:700 }}>{p.display_name || 'Unnamed'}</div>
                          {p.handle && <div className="muted">@{p.handle}</div>}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Chat dock */}
      {open && canChat && (
        <ChatDock
          me={{ id: me.id }}
          partnerId={partnerId}
          partnerName={partnerName}
          onClose={() => setOpen(false)}
          onUnreadChange={onUnreadChange}
        />
      )}
    </>
  )
}

