// src/pages/ProfilePage.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link, useNavigate } from 'react-router-dom'
import QRCode from 'react-qr-code'

export default function ProfilePage() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) { nav('/auth'); return }

      const { data, error } = await supabase
        .from('profiles')
        .select('handle, display_name, location, bio, avatar_url, public_profile')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!alive) return
      if (error) console.error(error)
      setProfile(data)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [nav])

  async function handleSignOut() {
    await supabase.auth.signOut()
    nav('/auth')
  }

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
        <div className="card">No profile found.</div>
      </div>
    )
  }

  const inviteUrl = `${window.location.origin}/connect?handle=${profile.handle}`

  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>
          <span style={{ color: 'var(--secondary)', fontWeight: 800 }}>Profile</span>
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {profile.public_profile && (
            <Link className="btn" to={`/u/${profile.handle}`} target="_blank">
              View Public Profile
            </Link>
          )}
          <Link className="btn" to="/settings">Settings</Link>
          <button className="btn" onClick={handleSignOut}>Sign Out</button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <img
          src={profile.avatar_url || 'https://via.placeholder.com/96?text=%F0%9F%91%A4'}
          alt="avatar"
          style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }}
        />
        <div>
          <h2 style={{ margin: '0 0 8px' }}>{profile.display_name || 'Unnamed user'}</h2>
          <div style={{ color: 'var(--muted)', marginBottom: 8 }}>@{profile.handle}</div>
          {profile.location && <div style={{ marginBottom: 8 }}>{profile.location}</div>}
          {profile.bio && <p style={{ margin: 0 }}>{profile.bio}</p>}
        </div>
      </div>

      {/* QR Invite Code (always visible for the owner) */}
      <div className="card" style={{ marginTop: 16, textAlign: 'center' }}>
        <h3 style={{ marginTop: 0 }}>Your Invite QR Code</h3>
        <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
          Share this QR code with people you want to connect with.
        </p>
        <div style={{ background: '#fff', display: 'inline-block', padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
          <QRCode value={inviteUrl} size={160} />
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            className="btn"
            onClick={() => { navigator.clipboard.writeText(inviteUrl) }}
            title="Copy invite link"
          >
            Copy Invite Link
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div><strong>Public profile:</strong> {profile.public_profile ? 'Yes' : 'No'}</div>
      </div>
    </div>
  )
}







