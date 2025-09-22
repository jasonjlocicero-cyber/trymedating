import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Likes() {
  const [user, setUser] = useState(null)
  const [mine, setMine] = useState([])     // users I liked (profiles)
  const [mutual, setMutual] = useState([]) // mutual matches (profiles)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  if (!supabase) {
    return <div style={{ padding: 40 }}>Supabase not configured.</div>
  }

  useEffect(() => { document.title = 'Likes • TryMeDating' }, [])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth'; return }
      setUser(user)

      try {
        setLoading(true); setError('')

        // 1) Likes I made: liker = me
        const { data: myLikes, error: e1 } = await supabase
          .from('likes')
          .select('likee')
          .eq('liker', user.id)
        if (e1) throw e1
        const likeeIds = (myLikes || []).map(r => r.likee)

        // 2) Likes toward me: likee = me
        const { data: towardMe, error: e2 } = await supabase
          .from('likes')
          .select('liker')
          .eq('likee', user.id)
        if (e2) throw e2
        const likerIds = (towardMe || []).map(r => r.liker)

        // 3) Mutual = intersection
        const likerSet = new Set(likerIds)
        const mutualIds = likeeIds.filter(id => likerSet.has(id))

        // 4) Fetch profiles (public ones)
        async function fetchProfiles(ids) {
          if (!ids.length) return []
          const { data, error } = await supabase
            .from('profiles')
            .select('user_id, handle, display_name, avatar_url, mode, bio')
            .in('user_id', ids)
            .eq('is_public', true)
          if (error) throw error
          return data || []
        }

        const [mineProfiles, mutualProfiles] = await Promise.all([
          fetchProfiles(likeeIds),
          fetchProfiles(mutualIds),
        ])

        // Sort mutual first by name
        mutualProfiles.sort((a,b) => (a.display_name || '').localeCompare(b.display_name || ''))
        mineProfiles.sort((a,b) => (a.display_name || '').localeCompare(b.display_name || ''))

        setMutual(mutualProfiles)
        setMine(mineProfiles)
      } catch (e) {
        setError(e.message || 'Failed to load likes.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div style={{ padding: 40, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h2>Likes & Matches</h2>
      {loading && <div>Loading…</div>}
      {error && <div style={{ color:'#C0392B' }}>{error}</div>}

      {/* Mutual matches */}
      <section style={{ marginTop: 16 }}>
        <h3>Mutual matches</h3>
        {mutual.length === 0 ? (
          <div style={{ opacity:.7 }}>No mutual matches yet.</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:16 }}>
            {mutual.map(p => (
              <Link key={p.user_id} to={`/u/${encodeURIComponent(p.handle)}`} style={{ textDecoration:'none', color:'inherit' }}>
                <div style={{ border:'1px solid #eee', borderRadius:12, padding:16 }}>
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
                    {(p.bio || '').slice(0,120)}{(p.bio || '').length > 120 ? '…' : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* People I liked */}
      <section style={{ marginTop: 28 }}>
        <h3>People you liked</h3>
        {mine.length === 0 ? (
          <div style={{ opacity:.7 }}>You haven’t liked anyone yet.</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:16 }}>
            {mine.map(p => (
              <Link key={p.user_id} to={`/u/${encodeURIComponent(p.handle)}`} style={{ textDecoration:'none', color:'inherit' }}>
                <div style={{ border:'1px solid #eee', borderRadius:12, padding:16 }}>
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
                    {(p.bio || '').slice(0,120)}{(p.bio || '').length > 120 ? '…' : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
