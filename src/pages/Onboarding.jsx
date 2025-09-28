// src/pages/Onboarding.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import AvatarUploader from '../components/AvatarUploader'
import InterestsPicker from '../components/InterestsPicker'
import { track } from '../lib/analytics'

// Steps:
// 0 = Welcome
// 1 = Avatar
// 2 = Handle & Basics
// 3 = Interests & Visibility (save)
const TOTAL_STEPS = 4

export default function Onboarding() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)

  // stepper
  const [step, setStep] = useState(0)

  // form state
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [location, setLocation] = useState('')
  const [bio, setBio] = useState('')
  const [publicProfile, setPublicProfile] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [interests, setInterests] = useState([])

  // ui
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // handle availability
  const [checkingHandle, setCheckingHandle] = useState(false)
  const [handleTaken, setHandleTaken] = useState(false)
  const checkTimer = useRef(null)

  const normalizedHandle = useMemo(
    () => (handle || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '').slice(0, 24),
    [handle]
  )

  const handleTooShort = normalizedHandle.length > 0 && normalizedHandle.length < 3
  const interestsValid = Array.isArray(interests) && interests.length >= 1
  const canSave =
    !!me?.id &&
    !saving &&
    !checkingHandle &&
    !handleTaken &&
    normalizedHandle.length >= 3 &&
    interestsValid

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) { setError('Please sign in to continue.'); setLoading(false); return }
      setMe(user)

      const { data: prof } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, location, bio, public_profile, avatar_url, interests')
        .eq('user_id', user.id)
        .maybeSingle()

      if (prof) {
        setHandle(prof.handle || guessHandleFromEmail(user.email))
        setDisplayName(prof.display_name || '')
        setLocation(prof.location || '')
        setBio(prof.bio || '')
        setPublicProfile(!!prof.public_profile)
        setAvatarUrl(prof.avatar_url || '')
        setInterests(Array.isArray(prof.interests) ? prof.interests : [])
      } else {
        setHandle(guessHandleFromEmail(user.email))
        setInterests([])
      }

      // If they already meet requirements, skip onboarding entirely
      if (prof?.handle && Array.isArray(prof?.interests) && prof.interests.length >= 1) {
        nav('/profile', { replace: true })
        return
      }

      setLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s?.user) { setMe(null); setError('Please sign in to continue.') } else { setMe(s.user) }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [nav])

  // Debounced handle availability check
  useEffect(() => {
    if (!me?.id) return
    setError(''); setNotice('')

    const h = normalizedHandle
    if (!h || h.length < 3) {
      setHandleTaken(false)
      setCheckingHandle(false)
      if (checkTimer.current) clearTimeout(checkTimer.current)
      return
    }

    setCheckingHandle(true)
    if (checkTimer.current) clearTimeout(checkTimer.current)
    checkTimer.current = setTimeout(async () => {
      const { data, error: hErr } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('handle', h)

      if (hErr) {
        setError(hErr.message || 'Could not check handle availability.')
        setCheckingHandle(false)
        return
      }
      setHandleTaken((data || []).some(r => r.user_id !== me.id))
      setCheckingHandle(false)
    }, 400)

    return () => { if (checkTimer.current) clearTimeout(checkTimer.current) }
  }, [normalizedHandle, me])

  function startOnboarding() {
    setStep(1)
    track('Onboarding Started')
  }

  function nextFromAvatar() {
    if (avatarUrl) track('Onboarding Avatar Added')
    else track('Onboarding Avatar Skipped')
    setStep(2)
  }

  function nextFromBasics() {
    // Light validation on this step: just ensure handle length (we'll still re-check on save)
    if (normalizedHandle.length < 3) {
      setError('Handle must be at least 3 characters.')
      return
    }
    if (handleTaken) {
      setError('That handle is taken.')
      return
    }
    setError('')
    setStep(3)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setNotice('')

    if (!me?.id) { setError('Please sign in first.'); return }
    if (normalizedHandle.length < 3) { setError('Handle must be at least 3 characters.'); return }
    if (checkingHandle) { setError('Checking handle availability…'); return }
    if (handleTaken) { setError('That handle is taken.'); return }
    if (!interestsValid) { setError('Please add at least one interest.'); return }

    setSaving(true)

    const payload = {
      user_id: me.id,
      handle: normalizedHandle,
      display_name: displayName?.trim() || null,
      location: location?.trim() || null,
      bio: bio?.trim() || null,
      public_profile: publicProfile,
      avatar_url: avatarUrl || null,
      interests: interests
    }

    const { error: upErr } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })

    if (upErr) {
      setError(upErr.message || 'Could not save profile.')
      setSaving(false)
      return
    }

    track('Onboarding Completed', {
      has_avatar: !!avatarUrl,
      interests_count: interests.length,
      public_profile: !!publicProfile
    })

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

  // STEP 0: Welcome
  if (step === 0) {
    return (
      <div className="container" style={{ padding: '48px 0', maxWidth: 820, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
          Step 1 of {TOTAL_STEPS}
        </div>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>
          <span style={{ color: 'var(--secondary)', fontWeight: 800 }}>Welcome</span>{' '}
          <span style={{ color: 'var(--primary)', fontWeight: 800 }}>to TryMeDating</span>
        </h1>
        <p className="muted" style={{ fontSize: '1.05rem', marginBottom: 16 }}>
          Let’s set up your profile in about a minute. You can change anything later.
        </p>

        <div className="card" style={{ margin: '0 auto', maxWidth: 640, textAlign: 'left' }}>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
            <li>Upload a photo (you can skip for now)</li>
            <li>Pick a unique handle (e.g. <code>yourname</code>)</li>
            <li>Add a few interests (helps others find you)</li>
            <li>Choose whether your profile is public</li>
          </ul>
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={startOnboarding}>Get Started</button>
          <button className="btn" onClick={() => nav('/profile')}>Skip for now</button>
        </div>

        {error && (
          <div className="card" style={{ borderLeft: '4px solid #e11d48', color: '#b91c1c', marginTop: 16 }}>
            {error}
          </div>
        )}
      </div>
    )
  }

  // STEP 1: Avatar
  if (step === 1) {
    return (
      <div className="container" style={{ padding: '48px 0', maxWidth: 820 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
          Step 2 of {TOTAL_STEPS}
        </div>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>
          <span style={{ color: 'var(--secondary)', fontWeight: 800 }}>Add</span>{' '}
          <span style={{ color: 'var(--primary)', fontWeight: 800 }}>a Photo</span>
        </h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          Profiles with photos get more responses. You can always change or remove it later.
        </p>

        <div className="card">
          <AvatarUploader me={me} initialUrl={avatarUrl} onChange={setAvatarUrl} />
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setStep(0)}>Back</button>
          <button className="btn btn-primary" onClick={nextFromAvatar}>Next</button>
          <button className="btn" onClick={() => { setAvatarUrl(''); nextFromAvatar() }}>Skip for now</button>
        </div>
      </div>
    )
  }

  // STEP 2: Handle & Basics
  if (step === 2) {
    return (
      <div className="container" style={{ padding: '32px 0', maxWidth: 820 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
          Step 3 of {TOTAL_STEPS}
        </div>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>
          <span style={{ color: 'var(--secondary)', fontWeight: 800 }}>Choose</span>{' '}
          <span style={{ color: 'var(--primary)', fontWeight: 800 }}>Your Handle</span>
        </h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          Pick a unique handle and add a few basics.
        </p>

        {error && (
          <div className="card" style={{ borderLeft: '4px solid #e11d48', color: '#b91c1c', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <form className="card" onSubmit={(e) => { e.preventDefault(); nextFromBasics() }} style={{ display: 'grid', gap: 14 }}>
          {/* Handle */}
          <div>
            <label style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              Handle
              {normalizedHandle && !checkingHandle && !handleTaken && normalizedHandle.length >= 3 && (
                <span title="Available" style={{ color: 'green', fontSize: 12 }}>✓ available</span>
              )}
              {normalizedHandle && !checkingHandle && handleTaken && (
                <span title="Taken" style={{ color: '#b91c1c', fontSize: 12 }}>✗ taken</span>
              )}
              {checkingHandle && <span style={{ color: 'var(--muted)', fontSize: 12 }}>checking…</span>}
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)' }}>@</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="yourname"
                aria-label="handle"
              />
            </div>
            <div style={{ fontSize: 12, color: handleTooShort ? '#b91c1c' : 'var(--muted)', marginTop: 4 }}>
              {handleTooShort
                ? 'Handle must be at least 3 characters.'
                : 'Letters, numbers, underscore. Up to 24 characters.'}
            </div>
          </div>

          {/* Display name */}
          <div>
            <label style={{ fontWeight: 700 }}>Display name</label>
            <input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder="How you want to appear" />
          </div>

          {/* Location */}
          <div>
            <label style={{ fontWeight: 700 }}>Location</label>
            <input value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="City, State (optional)" />
          </div>

          {/* Bio */}
          <div>
            <label style={{ fontWeight: 700 }}>Short bio</label>
            <textarea rows={3} maxLength={300} value={bio} onChange={(e)=>setBio(e.target.value)} placeholder="A sentence or two (optional)" style={{ resize:'vertical' }} />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {bio.length > 240 ? `${bio.length}/300` : 'Up to 300 characters.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" type="submit">Next</button>
          </div>
        </form>
      </div>
    )
  }

  // STEP 3: Interests & Visibility (final save)
  const previewPublicUrl = normalizedHandle ? `/u/${normalizedHandle}` : null

  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 820 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
        Step 4 of {TOTAL_STEPS}
      </div>
      <h1 style={{ marginTop: 0, marginBottom: 8 }}>
        <span style={{ color: 'var(--secondary)', fontWeight: 800 }}>Interests</span>{' '}
        <span style={{ color: 'var(--primary)', fontWeight: 800 }}>& Visibility</span>
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        Add a few interests and choose whether your profile is public.
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
        {/* Interests */}
        <InterestsPicker value={interests} onChange={setInterests} max={8} />

        {/* Public toggle */}
        <div className="card" style={{ display:'flex', alignItems:'center', gap:12 }}>
          <input id="publicProfile" type="checkbox" checked={publicProfile} onChange={(e)=>setPublicProfile(e.target.checked)} />
          <label htmlFor="publicProfile" style={{ userSelect:'none' }}>
            Make my profile public (anyone with my link can view)
          </label>
        </div>

        {/* Preview link (optional) */}
        {publicProfile && previewPublicUrl && (
          <div className="muted" style={{ fontSize: 12 }}>
            Your public link will be: <code>{window.location.origin}{previewPublicUrl}</code>
          </div>
        )}

        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button className="btn" type="button" onClick={() => setStep(2)} disabled={saving}>Back</button>
          <button className="btn btn-primary" type="submit" disabled={!canSave}>
            {saving ? 'Saving…' : 'Save & Continue'}
          </button>
          <button className="btn" type="button" onClick={()=>nav('/profile')} disabled={saving}>
            Skip for now
          </button>
        </div>
      </form>
    </div>
  )
}

function guessHandleFromEmail(email) {
  if (!email) return ''
  const base = email.split('@')[0] || ''
  return base.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24)
}





