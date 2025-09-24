import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Network() {
  const [me, setMe] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setMe(user || null)
      if (!user) return
      // fetch connection rows where current user is involved
      const { data, error } = await supabase
        .from('connections')
        .select('user_1, user_2, created_at')
        .or(`user_1.eq.${user.id},user_2.eq.${user.id}`)
        .order('created_at', { ascending: false })
      if (error) setError(error.message)
      const partnerIds = (data || []).map(r => r.user_1 === user.id ? r.user_2 : r.user_1)
      // pull partner profiles
      let partners = []
      if (partnerIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url, location, bio')
          .in('user_id', partnerIds)
        partners = profs || []
      }
      setRows(partners)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

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

      {loading && <div className="card">Loading connections…</div>}
      {error && <div className="card" style={{ borderColor:'#e11d48', color:'#e11d48' }}>{error}</div>}

      {!loading && rows.length === 0 && (
        <div className="card">
          <div>No connections yet.</div>
          <div style={{ marginTop: 8 }}>Ask someone to scan your QR on the <strong>Invite</strong> page.</div>
        </div>
      )}

      <div style={{
        display:'grid',
        gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16
      }}>
        {rows.map(p => (
          <div key={p.user_id} className="card" style={{ display:'grid', gap: 10 }}>
            <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
              <img
                src={p.avatar_url || 'https://via.placeholder.com/64?text=%F0%9F%91%A4'}
                alt=""
                style={{ width: 64, height: 64, borderRadius:'50%', objectFit:'cover', border:'1px solid var(--border)' }}
              />
              <div>
                <div style={{ fontWeight: 800 }}>{p.display_name || p.handle}</div>
                <div className="badge">@{p.handle}</div>
              </div>
            </div>
            {p.bio && <div style={{ color:'var(--muted)' }}>{p.bio}</div>}
            <div style={{ display:'flex', gap: 8 }}>
              <a className="btn" href={`/u/${p.handle}`}>View profile</a>
              <button className="btn btn-primary" onClick={() => message(p.handle)}>Message</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
