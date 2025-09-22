import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

/**
 * Explore page
 * - Lists public profiles
 * - Server-side search (handle/display_name/bio)
 * - Mode filter (dating/friends/browsing)
 * - Pagination with "Load more"
 */
export default function Explore() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState('all') // all | dating | friends | browsing
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  // Page size for pagination
  const PAGE_SIZE = 12

  // Friendly message if env vars are missing
  if (!supabase) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Explore</h2>
        <p>Supabase is not configured. Add env vars and redeploy.</p>
      </div>
    )
  }

  useEffect(() => { document.title = 'Explore • TryMeDating' }, [])

  // Build a server-side query for profiles
  function buildQuery() {
    let query = supabase
      .from('profiles')
      .select('handle, display_name, bio, avatar_url, mode, updated_at')
      .eq('is_public', true)

    if (mode !== 'all') {
      query = query.eq('mode', mode)
    }

    const term = q.trim()
    if (term) {
      // Safely escape percent signs to avoid breaking ilike pattern
      const safe = term.replace(/%/g, '\\%').replace(/_/g, '\\_')
      // Search handle OR display_name OR bio
      query = query.or(
        `handle.ilike.%${safe}%,display_name.ilike.%${safe}%,bio.ilike.%${safe}%`
      )
    }

    // Newest first
    query = query.order('updated_at', { ascending: false })

    // Pagination range
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    query = query.range(from, to)

    return query
  }

  // Load a page (appends results unless reset=true)
  async function load({ reset = false } = {}) {
    setLoading(true)
    setError('')
    try {
      const { data, error } = await buildQuery()
      if (error) throw error

      const arr = data || []
      setHasMore(arr.length === PAGE_SIZE)

      if (reset) {
        setRows(arr)
      } else {
        setRows(prev => [...prev, ...arr])
      }
    } catch (e) {
      setError(e.message || 'Failed to load profiles.')
    } finally {
      setLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    setPage(0)
    setHasMore(true)
    load({ reset: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once

  // When filters/search change → reset to page 0 and reload
  useEffect(() => {
    setPage(0)
    setHasMore(true)
    load({ reset: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Submit search
  function onSearch(e) {
    e?.preventDefault()
    setPage(0)
    setHasMore(true)
    load({ reset: true })
  }

  // Load next page
  async function loadMore() {
    if (loading || !hasMore) return
    setPage(prev => prev + 1)
    // Wait for state update to reflect in buildQuery; a tiny timeout avoids using stale "page"
    setTimeout(() => load({ reset: false }), 0)
  }

  return (
    <div style={{ padding: 40, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h2 style={{ marginBottom: 12 }}>Explore public profiles</h2>

      {/* Controls */}
      <form onSubmit={onSearch} style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:16 }}>
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="Search by name, handle, or bio…"
          style={{ padding:10, border:'1px solid #ddd', borderRadius:8, minWidth:260 }}
        />
        <select
          value={mode}
          onChange={e=>setMode(e.target.value)}
          style={{ padding:10, border:'1px solid #ddd', borderRadius:8 }}
        >
          <option value="all">All modes</option>
          <option value="dating">Dating</option>
          <option value="friends">Friends</option>
          <option value="browsing">Browsing</option>
        </select>
        <button
          type="submit"
          style={{ padding:'10px 12px', border:'1px solid #ddd', borderRadius:8, background:'#fff' }}
          disabled={loading}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
        <button
          type="button"
          onClick={() => { setQ(''); setMode('all'); onSearch() }}
          style={{ padding:'10px 12px', border:'1px solid #ddd', borderRadius:8, background:'#fff' }}
          disabled={loading}
        >
          Reset
        </button>
      </form>

      {/* Status */}
      {error && <div style={{ color:'#C0392B', marginBottom:12 }}>{error}</div>}
      {rows.length === 0 && !loading && !error && <div>No public profiles found.</div>}

      {/* Grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:16 }}>
        {rows.map(p => (
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
              <div style={{ fontSize:12, opacity:.6, marginTop:8 }}>
                Updated {new Date(p.updated_at).toLocaleDateString()}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Load more */}
      <div style={{ display:'flex', justifyContent:'center', marginTop:20 }}>
        {hasMore ? (
          <button
            onClick={loadMore}
            disabled={loading}
            style={{ padding:'10px 14px', border:'1px solid #ddd', borderRadius:8, background:'#fff' }}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        ) : (
          rows.length > 0 && <div style={{ opacity:.7 }}>No more results.</div>
        )}
      </div>
    </div>
  )
}

