// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function PublicProfile() {
  const { handle } = useParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('handle, display_name, location, bio, avatar_url, public_profile')
        .eq('handle', handle)
        .eq('public_profile', true)
        .maybeSingle()

      if (!alive) return
      if (error) console.error(error)
      setProfile(data)
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

  if (!profile) {
    return (
      <div className="container" style={{ padding: '32px 0' }}>
        <div className="card">This profile is private or does not exist.</div>
      </div>
    )
  }

  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 720 }}>
      <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <img
          src={profile.avatar_url || 'https://via.placeholder.com/96?text=%F0%9F%91%A4'}
          alt="avatar"
          style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }}
        />
        <div>
          {/* Stronger text for readability */}
          <h2 style={{ margin: '0 0 8px', color: 'var(--text)' }}>
            {profile.display_name || 'Unnamed user'}
          </h2>
          <div style={{ marginBottom: 8, color: 'var(--text)' }}>
            @{profile.handle}
          </div>
          {profile.location && (
            <div style={{ marginBottom: 8, color: 'var(--text)' }}>
              {profile.location}
            </div>
          )}
          {profile.bio && (
            <p style={{ margin: 0, color: 'var(--text)' }}>
              {profile.bio}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}






