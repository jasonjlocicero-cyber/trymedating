// src/pages/Onboarding.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Onboarding() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)

  // form state
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [location, setLocation] = useState('')
  const [bio, setBio] = useState('')
  const [publicProfile, setPublicProfile] = useState(true)

  // ui state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // derived
  const normalizedHandle = useMemo(() =>
    (handle || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 24)
  , [handle])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) {
        setError('Please sign in to continue.')
        setLoading(false)
        return
      }
      setMe(user)
      // load existing profile, if any
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, location, bio, public_profile')
        .eq('user_id', user.id)
        .maybeSingle()

      if (prof) {
        setHandle(prof.handle || '')
        setDisplayName(prof.display_name || '')
        setLocation(prof.location || '')
        setBio(prof.bio || '')
        setPublicProfile(!!prof.public_profile)
      }
      setLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s?.user) {
        setMe(null)
        setError('Please sign in to continue.')
      } else {
        setMe(s.user)
      }
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')

    if (!me?.id) {
      setError('Please sign in first.')
      return
    }

    const h = normalizedHandle
    if (!h || h.length < 3) {
      setError('Handle must be at least 3 characters (letters, numbers, underscore).')
      return
    }

    setSaving(true)

    // Uniqueness check for handle (exclude me)
    const { data: existing, error: hErr } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('handle', h)
    if (hErr) {
      setError(hErr.message || 'Could not verify handle uniqueness.')
      setSaving(false)
      return
    }
    const taken = (existing || []).some(r => r.user_id !== me.id)
    if (taken) {
      setError('That handle is already taken. Please choose another.')
      setSaving(false)
      return
    }

    // Upsert profile
    const payload = {
      user_id: me.id,
      handle: h,
      display_name: displayName?.trim() || null,
      location: location?.trim() || null,
      bio: bio?.trim() || null,
      public_profile: publicProfile
    }

    const { error: upErr } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })

    if (upErr) {
      setError(upErr.message || 'Could not save profile.')
      setSaving(false)
      return
    }

    setNotice('Saved! Redirecting to your profile…')
    setSaving(false)
    setTimeout(() => nav('/profile'), 600)
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: '32px 0' }}>
        <div className="card">Loading…</div>
      </div>
    )
  }

  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 820 }}>
      <h1 style={{ marginBottom: 8 }}>
        <span style={{ color: 'var(--secondary)', fontWeight: 800 }}>Finish</span>{' '}
        <span style={{ color: 'var(--primary)', fontWeight: 800 }}>Setting Up</span>
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        Choose a handle and basic details. You can change these anytime in Settings.
      </p>

      {error && (
        <div className="card" style={{ borderLeft: '4px solid #e11d48', color: '#b91c1c', marginBottom: 12 }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="card" style={{ borderLeft: '4px solid var(--secondary)', color: 'var(--secondary)', marginBottom: 12 }}>
          {notice}
        </div>
      )}

      <form className="card" onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
        {/* Handle */}
        <div>
          <label style={{ fontWeight: 700 }}>Handle</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'var(--muted)' }}>@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourname"
              required
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Only letters, numbers, and underscores. Shown on your public link.
          </div>
        </div>

        {/* Display name */}
        <div>
          <label style={{ fontWeight: 700 }}>Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How you want to appear"
          />
        </div>

        {/* Location */}
        <div>
          <label style={{ fontWeight: 700 }}>Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, State (optional)"
          />
        </div>

        {/* Bio */}
        <div>
          <label style={{ fontWeight: 700 }}>Short bio</label>
          <textarea
            rows={3}
            maxLength={300}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A sentence or two about you (optional)"
            style={{ resize: 'vertical' }}
          />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {bio.length > 240 ? `${bio.length}/300` : 'Up to 300 characters.'}
          </div>
        </div>

        {/* Public profile toggle */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            id="publicProfile"
            type="checkbox"
            checked={publicProfile}
            onChange={(e) => setPublicProfile(e.target.checked)}
          />
          <label htmlFor="publicProfile" style={{ userSelect: 'none' }}>
            Make my profile public (anyone with my link can view)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save & Continue'}
          </button>
          <button className="btn" type="button" onClick={() => window.history.back()} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
