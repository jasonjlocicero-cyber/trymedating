// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function PublicProfile() {
  const { handle } = useParams()
  const [prof, setProf] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Add <meta name="robots" content="noindex,nofollow"> to discourage indexing
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex,nofollow'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  // Load profile by handle
  useEffect(() => {
    if (!handle) return
    let alive = true
    ;(async () => {
      setLoading(true); setError('')
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, bio, age, location, interests')
        .eq('handle', handle.toLowerCase())
        .maybeSingle()
      if (!alive) return
      if (error) setError(error.message)
      setProf(data || null)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [handle])

  if (loading) {
    return (
      <div className="container" style={{ padding: '32px 0' }}>
        <div className="card">Loading profile…</div>
      </div>
    )
  }

  if (error || !prof) {
    return (
      <div className="container" style={{ padding: '32px 0' }}>
        <div className="card" style={{ borderColor: '#e11d48', color: '#e11d48' }}>
          {error || 'Profile not found.'}
        </div>
      </div>
    )
  }

  return (
    <div className="container" style={{ padding: '32px 0' }}>
      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <img
            src={prof.avatar_url || 'https://via.placeholder.com/96?text=%F0%9F%91%A4'}
            alt=""
            style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
          />
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ margin: 0 }}>{prof.display_name || 'Member'}</h1>
            {prof.location && <div style={{ color: 'var(--muted)', marginTop: 6 }}>{prof.location}</div>}
          </div>
        </div>

        {/* Bio */}
        {prof.bio && <p style={{ marginTop: 4 }}>{prof.bio}</p>}

        {/* Details */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {prof.age && <span className="badge">Age: {prof.age}</span>}
          {Array.isArray(prof.interests) && prof.interests.length > 0 && prof.interests.map((tag, i) => (
            <span key={i} className="badge">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  )
}





