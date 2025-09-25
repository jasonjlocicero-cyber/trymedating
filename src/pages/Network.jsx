// src/pages/Network.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Network() {
  const [me, setMe] = useState(null)

  // Connections
  const [connections, setConnections] = useState([])
  const [connLoading, setConnLoading] = useState(true)
  const [connErr, setConnErr] = useState('')

  // Blocks
  const [blocked, setBlocked] = useState([])
  const [blockLoading, setBlockLoading] = useState(true)
  const [blockErr, setBlockErr] = useState('')

  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setMe(user || null)
      if (user) {
        await Promise.all([loadConnections(user.id), loadBlocked(user.id)])
      } else {
        setConnLoading(false)
        setBlockLoading(false)
      }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setMe(s?.user || null)
      if (!s?.user) {
        setConnections([]); setConnLoading(false); setConnErr('')
        setBlocked([]); setBlockLoading(false); setBlockErr('')
      } else {
        loadConnections(s.user.id)
        loadBlocked(s.user.id)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function loadConnections(myId) {
    setConnLoading(true); setConnErr('')
    const { data, error } = await supabase
      .from('connections')
      .select('user_1, user_2, created_at')
      .or(`user_1.eq.${myId},user_2.eq.${myId}`)
      .order('created_at', { ascending: false })
    if (error) { setConnErr(error.message); setConnLoading(false); return }

    const partnerIds = (data || []).map(r => r.user_1 === myId ? r.user_2 : r.user_1)

    let partners = []
    if (partnerIds.length) {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_url, location, bio')
        .in('user_id', partnerIds)
      if (pErr) { setConnErr(pErr.message) }
      partners = profs || []
    }
    setConnections(partners)
    setConnLoading(false)
  }

  async function loadBlocked(myId) {
    setBlockLoading(true); setBlockErr('')
    // Get the rows where I am the blocker
    const { data: rows, error } = await supabase
      .from('blocks')
      .select('blocked')
      .eq('blocker', myId)
    if (error) { setBlockErr(error.message); setBlockLoading(false); return }

    const ids = (rows || []).map(r => r.blocked)
    let profiles = []
    if (ids.length) {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_url, location')
        .in('user_id', ids)
      if (pErr) { setBlockErr(pErr.message) }
      profiles = profs || []
    }
    setBlocked(profiles)
    setBlockLoading(false)
  }

  async function onRemove(partnerId) {
    if (!me?.id) return
    if (!confirm('Remove this connection?')) return
    setBusy(true)
    const { error } = await supabase.rpc('remove_connection', { p_other: partnerId })
    if (error) alert(error.message || 'Could not remove connection')
    await loadConnections(me.id)
    setBusy(false)
  }

  async function onBlock(partnerId) {
    if (!me?.id) return
    if (!confirm('Block this user? They will not be able to connect or message you.')) return
    setBusy(true)
    const { error } = await supabase.rpc('block_user', { p_other: partnerId })
    if (error) alert(error.message || 'Could not block user')
    await Promise.all([loadConnections(me.id), loadBlocked(me.id)])
    setBusy(false)
  }

  async function onUnblock(userId) {
    if (!me?.id) return
    if (!confirm('Unblock this user?')) return
    setBusy(true)
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker', me.id)
      .eq('blocked', userId)
    if (error) alert(error.message || 'Could not unblock user')
    await loadBlocked(me.id)
    setBusy(false)
  }

  function message(handle) {
    if (!window.trymeChat) return alert('Messaging not ready on this page.')
    window.trymeChat.open({ handle })
  }

  return (
    <div className="container" style={{ padding: '32px 0' }}>
      <h1 style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--secondary)' }}>My</span>{' '}
        <span style={{ color: 'var(--primary)' }}>Network</span>
      </h1>

      {/* Connections */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>Connections</div>
        {connLoading && <div>Loading…</div>}
        {connErr && <div style={{ color:'#e11d48' }}>{connErr}</div>}
        {!connLoading && connections.length === 0 && <div style={{ color:'var(--muted)' }}>No connections yet.</div>}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {connections.map(p => (
            <div key={p.user_id} className="card" style={{ display:'grid', gap: 10 }}>
              <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
                <img
                  src={p.avatar_url || 'https://via.placeholder.com/64?text=%F0%9F%91%A4'}
                  alt=""
                  style={{ width: 64, height: 64, borderRadius:'50%', objectFit:'cover', border:'1px solid var(--border)' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{p.display_name || p.handle}</div>
                  <div className="badge">@{p.handle}</div>
                  {p.location && <div style={{ fontSize:12, color:'var(--muted)' }}>{p.location}</div>}
                </div>
              </div>
              {p.bio && <div style={{ color:'var(--muted)' }}>{p.bio}</div>}
              <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
                <a className="btn" href={`/u/${p.handle}`} target="_blank" rel="noreferrer">View profile</a>
                <button className="btn btn-primary" onClick={() => message(p.handle)} disabled={busy}>Message</button>
                <button className="btn" onClick={() => onRemove(p.user_id)} disabled={busy}>Remove</button>
                <button className="btn" onClick={() => onBlock(p.user_id)} disabled={busy}>Block</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Blocked users */}
      <div className="card">
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>Blocked Users</div>
        {blockLoading && <div>Loading…</div>}
        {blockErr && <div style={{ color:'#e11d48' }}>{blockErr}</div>}
        {!blockLoading && blocked.length === 0 && <div style={{ color:'var(--muted)' }}>You haven’t blocked anyone.</div>}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {blocked.map(p => (
            <div key={p.user_id} className="card" style={{ display:'grid', gap: 10 }}>
              <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
                <img
                  src={p.avatar_url || 'https://via.placeholder.com/64?text=%F0%9F%91%A4'}
                  alt=""
                  style={{ width: 64, height: 64, borderRadius:'50%', objectFit:'cover', border:'1px solid var(--border)' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{p.display_name || p.handle}</div>
                  <div className="badge">@{p.handle}</div>
                  {p.location && <div style={{ fontSize:12, color:'var(--muted)' }}>{p.location}</div>}
                </div>
              </div>
              <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
                <a className="btn" href={`/u/${p.handle}`} target="_blank" rel="noreferrer">View profile</a>
                <button className="btn" onClick={() => onUnblock(p.user_id)} disabled={busy}>Unblock</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
