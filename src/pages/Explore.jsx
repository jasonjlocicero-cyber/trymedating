import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Explore() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')        // simple search by handle/name
  const [error, setError] = useState('')

  if (!supabase) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Explore</h2>
        <p>Supabase is not configured. Add env vars and redeploy.</p>
      </div>
    )
  }

  useEffect(() => { document.title = 'Explore • TryMeDating' }, [])

  async function load() {
    setLoading(true); setError('')
    // Basic “search”: filter client-side for simplicity
    const { data, error } = await supabase
      .from('profiles')
      .select('handle, display_name, bio, avatar_url, mode, updated_at')
      .eq('is_public', true)
      .order('updated_at', { ascending: false })
      .limit(60)
    if (error) setError(error.message)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = rows.filter(p => {
    if (!q.trim()) return true
    const s = q.toLowerCase()
    return (p.display_name || '').toLowerCase().includes(s) ||
           (p.handle || '').toLowerCase().includes(s) ||
           (p.bio || '').toLowerCase().includes(s)
  })

  return (
    <div style={{ padding: 40, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h2 style={{ marginBottom: 12 }}>Explore public profiles</h2>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="Search by name, handle, or bio…"
          style={{ padding:10, border:'1px solid #ddd', borderRadius:8, minWidth:260 }}
        />
        <button onClick={load} style={{ padding:'10px 12px', border:'1px solid #ddd', borderRadius:8, background:'#fff' }}>
          Refresh
        </button>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div style={{ color:'#C0392B' }}>{error}</div>}
      {!loading && filtered.length === 0 && <div>No public profiles yet.</div>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:16 }}>
        {filtered.map(p => (
          <Link
            key={p.handle}
            to={`/u/${encodeURIComponent(p.handle)}`}
            style={{ textDecoration:'none', color:'inherit' }}
          >
            <div style={{ border:'1px solid #eee', borderRadius:12, padding:16, height:'100%' }}>
              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                <img
                  src={p.avatar_url || 'https://via.placeholder.com/64?text=%F0%9F%98%8A'}
                  alt=""
                  style={{ width:64, height:64, borderRadius:'50%', objectFit:'cover', border:'1px solid #eee' }}
                />
                <div>
                  <div style={{ fontWeight:700 }}>{p.display_name || '—'}</div>
                  <div style={{ fontSize:13, opacity:.8 }}>@{p.handle} · {p.mode}</div>
                </div>
              </div>
              <p style={{ marginTop:12, fontSize:14, lineHeight:1.4, color:'#333' }}>
                {(p.bio || '').slice(0,140)}
                {p.bio && p.bio.length > 140 ? '…' : ''}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
