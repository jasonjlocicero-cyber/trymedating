// src/pages/SettingsPage.jsx
import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import AvatarUploader from '../components/AvatarUploader'
import InterestsPicker from '../components/InterestsPicker'

export default function SettingsPage() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)

  // profile fields
  const [displayName, setDisplayName] = useState('')
  const [location, setLocation] = useState('')
  const [bio, setBio] = useState('')
  const [publicProfile, setPublicProfile] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [interests, setInterests] = useState([])

  // ui
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) { nav('/auth'); return }
      setMe(user)

      const { data: prof, error: perr } = await supabase
        .from('profiles')
        .select('display_name, location, bio, public_profile, avatar_url, handle, interests')
        .eq('user_id', user.id)
        .maybeSingle()

      if (perr) {
        setError(perr.message)
      } else if (prof) {
        setDisplayName(prof.display_name || '')
        setLocation(prof.location || '')
        setBio(prof.bio || '')
        setPublicProfile(!!prof.public_profile)
        setAvatarUrl(prof.avatar_url || '')
        setInterests(Array.isArray(prof.interests) ? prof.interests : [])
      }
      setLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s?.user) nav('/auth')
    })
    return () => sub.subscription.unsubscribe()
  }, [nav])

  async function saveProfile(e) {
    e.preventDefault()
    setError(''); setNotice('')
    if (!me?.id) { setError('Please sign in.'); return }

    setSaving(true)
    const payload = {
      display_name: displayName?.trim() || null,
      location: location?.trim() || null,
      bio: bio?.trim() || null,
      public_profile: publicProfile,
      avatar_url: avatarUrl || null,
      interests: Array.isArray(interests) ? interests : []
    }
    const { error: upErr } = await supabase
      .from('profiles')
      .update(payload)
      .eq('user_id', me.id)

    if (upErr) {
      setError(upErr.message || 'Could not save settings.')
    } else {
      setNotice('Settings saved.')
    }
    setSaving(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    nav('/auth')
  }

  async function deleteAccount() {
    const ok = confirm('Delete your account? This removes your profile and messages. This cannot be undone.')
    if (!ok) return
    try {
      const res = await fetch('/api/delete-account', { method: 'POST' })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || 'Delete failed')
      }
      await supabase.auth.signOut()
      alert('Account deleted.')
      nav('/')
    } catch (err) {
      setError(err.message || 'Delete failed')
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: '32px 0' }}>
        <div className="card">Loading…</div>
      </div>
    )
  }

  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0 }}>
          <span style={{ color: 'var(--secondary)', fontWeight: 800 }}>Account</span>{' '}
          <span style={{ color: 'var(--primary)', fontWeight: 800 }}>Settings</span>
        </h1>
        <Link className="btn" to="/profile">View Profile</Link>
      </div>

      {error && (
        <div className="card" style={{ marginTop: 12, borderLeft: '4px solid #e11d48', color: '#b91c1c' }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--secondary)', color: 'var(--secondary)' }}>
          {notice}
        </div>
      )}

      {/* Avatar */}
      <div style={{ marginTop: 16 }}>
        <AvatarUploader me={me} initialUrl={avatarUrl} onChange={setAvatarUrl} />
      </div>

      {/* Profile details + Interests */}
      <form onSubmit={saveProfile} className="card" style={{ marginTop: 16, display: 'grid', gap: 14 }}>
        <div>
          <label style={{ fontWeight: 700 }}>Display name</label>
          <input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder="How you appear" />
        </div>

        <div>
          <label style={{ fontWeight: 700 }}>Location</label>
          <input value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="City, State (optional)" />
        </div>

        <div>
          <label style={{ fontWeight: 700 }}>Short bio</label>
          <textarea
            rows={3}
            maxLength={300}
            value={bio}
            onChange={(e)=>setBio(e.target.value)}
            placeholder="A sentence or two (optional)"
            style={{ resize: 'vertical' }}
          />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {bio.length > 240 ? `${bio.length}/300` : 'Up to 300 characters.'}
          </div>
        </div>

        {/* Interests editor */}
        <InterestsPicker value={interests} onChange={setInterests} max={8} />

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            id="publicProfile"
            type="checkbox"
            checked={publicProfile}
            onChange={(e)=>setPublicProfile(e.target.checked)}
          />
          <label htmlFor="publicProfile" style={{ userSelect: 'none' }}>
            Make my profile public (anyone with my link can view)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button className="btn" type="button" onClick={handleSignOut}>Sign out</button>
        </div>
      </form>

      {/* Danger zone */}
      <div className="card" style={{ marginTop: 16, borderLeft: '4px solid #e11d48' }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Danger zone</div>
        <p className="muted">
          Permanently delete your account and associated data.
        </p>
        <button className="btn" onClick={deleteAccount} style={{ borderColor: '#e11d48', color: '#e11d48' }}>
          Delete account
        </button>
      </div>
    </div>
  )
}




