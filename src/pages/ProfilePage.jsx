// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

/**
 * Safe auth hydration:
 * - We first wait for supabase.auth.getUser() to resolve.
 * - While waiting, we show a small loading state.
 * - Only if user is truly null after hydration do we show the "Please sign in" prompt.
 *
 * This prevents the false-negative "please sign in" when the session hasn't hydrated yet.
 */

export default function ProfilePage() {
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState(null)

  // profile state
  const [saving, setSaving] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const [msg, setMsg] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')
  const [publicProfile, setPublicProfile] = useState(false)

  // 1) Hydrate auth (once)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setUser(user || null)
      setAuthLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user || null)
    })
    return () => {
      alive = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  // 2) Load profile when we have a user
  useEffect(() => {
    if (!user?.id) return
    let cancel = false
    ;(async () => {
      setLoadErr(''); setMsg('')
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, handle, city, bio, public_profile')
        .eq('user_id', user.id)
        .single()
      if (error) {
        // If no row yet, that's fine—we'll create it on first save
        if (error.code !== 'PGRST116') setLoadErr(error.message || 'Failed to load profile')
      } else if (!cancel && data) {
        setDisplayName(data.display_name || '')
        setHandle(data.handle || '')
        setCity(data.city || '')
        setBio(data.bio || '')
        setPublicProfile(!!data.public_profile)
      }
    })()
    return () => { cancel = true }
  }, [user?.id])

  async function saveProfile(e) {
    e?.preventDefault?.()
    if (!user?.id) return

    setSaving(true); setSaveErr(''); setMsg('')
    try {
      const payload = {
        user_id: user.id,
        display_name: displayName || null,
        handle: handle || null,
        city: city || null,
        bio: bio || null,
        public_profile: publicProfile
      }

      const { error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'user_id' })
      if (error) throw error

      setMsg('Profile saved.')
    } catch (e) {
      setSaveErr(e.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  // UI states
  if (authLoading) {
    return (
      <div className="container" style={{ padding: '28px 0' }}>
        <div className="muted">Checking your session…</div>
      </div>
    )
  }

  if (!user) {
    // truly not signed in
    return (
      <div className="container" style={{ padding: '28px 0' }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Please sign in</h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          You need to sign in to edit your profile.
        </p>
        <Link className="btn btn-primary" to="/auth">Go to sign in</Link>
      </div>
    )
  }

  return (
    <div className="container" style={{ padding: '28px 0', maxWidth: 760 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
      {loadErr && <div className="helper-error" style={{ marginBottom: 12 }}>{loadErr}</div>}
      {saveErr && <div className="helper-error" style={{ marginBottom: 12 }}>{saveErr}</div>}
      {msg && <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>}

      <form onSubmit={saveProfile} style={{ display: 'grid', gap: 12 }}>
        <label className="form-label">
          Display name
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </label>

        <label className="form-label">
          Handle
          <input
            className="input"
            value={handle}
            onChange={(e) => setHandle(e.target.value.trim().toLowerCase())}
            placeholder="your-handle"
          />
          <div className="helper-muted">Your public URL will be /u/&lt;handle&gt;</div>
        </label>

        <label className="form-label">
          City
          <input
            className="input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City, State"
          />
        </label>

        <label className="form-label">
          Bio
          <textarea
            className="input"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short introduction…"
          />
        </label>

        <label className="form-check" style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input
            type="checkbox"
            checked={publicProfile}
            onChange={(e) => setPublicProfile(e.target.checked)}
          />
          Make my profile public
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={saving} type="submit">
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {handle && publicProfile && (
            <Link className="btn btn-neutral" to={`/u/${handle}`} target="_blank" rel="noreferrer">
              View public profile
            </Link>
          )}
        </div>
      </form>
    </div>
  )
}



















