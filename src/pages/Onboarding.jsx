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
const STEP_LABELS = ['Welcome', 'Photo', 'Basics', 'Interests']
const HANDLE_MAX = 24
const BIO_MAX = 300
const DRAFT_VERSION = 'v1' // bump if structure changes

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
  const [savedHint, setSavedHint] = useState(false)

  // handle availability
  const [checkingHandle, setCheckingHandle] = useState(false)
  const [handleTaken, setHandleTaken] = useState(false)
  const checkTimer = useRef(null)

  // refs for auto-focus / key handling
  const avatarStepStartRef = useRef(null)
  const handleInputRef = useRef(null)
  const displayNameRef = useRef(null)
  const locationRef = useRef(null)
  const bioRef = useRef(null)
  const interestsFirstFocusableRef = useRef(null)

  // ===== Validation helpers =====
  const normalizedHandle = useMemo(
    () => (handle || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '').slice(0, HANDLE_MAX),
    [handle]
  )
  const handleDirty = handle.length > 0
  const handleLen = normalizedHandle.length
  const handleTooShort = handleDirty && handleLen < 3
  const handleValidFormat = useMemo(() => /^[a-z0-9_]{3,24}$/.test(normalizedHandle), [normalizedHandle])
  const handleValid = handleDirty && handleValidFormat && !checkingHandle && !handleTaken

  const bioLen = bio.length
  const bioNearLimit = bioLen > BIO_MAX - 60
  const bioTooLong = bioLen > BIO_MAX

  const interestsValid = Array.isArray(interests) && interests.length >= 1

  const canSave =
    !!me?.id &&
    !saving &&
    !checkingHandle &&
    handleValid &&
    !bioTooLong &&
    interestsValid

  // ===== Helpers for draft =====
  const draftKey = me?.id ? `onbDraft:${DRAFT_VERSION}:${me.id}` : null
  const draftSaveTimer = useRef(null)
  function showSavedHint() {
    setSavedHint(true)
    setTimeout(() => setSavedHint(false), 900)
  }
  function saveDraftImmediate() {
    if (!draftKey) return
    const payload = {
      step, handle, displayName, location, bio, publicProfile, avatarUrl, interests,
      ts: Date.now(), v: DRAFT_VERSION
    }
    try {
      localStorage.setItem(draftKey, JSON.stringify(payload))
      showSavedHint()
    } catch {}
  }
  function saveDraftDebounced() {
    if (!draftKey) return
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
    draftSaveTimer.current = setTimeout(saveDraftImmediate, 400)
  }
  function loadDraftIfAny() {
    if (!draftKey) return null
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return null
      const d = JSON.parse(raw)
      if (!d || d.v !== DRAFT_VERSION) return null
      return d
    } catch { return null }
  }
  function clearDraft() {
    if (!draftKey) return
    try { localStorage.removeItem(draftKey) } catch {}
  }

  // ===== Auth bootstrap + initial data (and draft restore) =====
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

      // If profile exists, seed from DB
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

      // If already complete, skip onboarding
      if (prof?.handle && Array.isArray(prof?.interests) && prof.interests.length >= 1) {
        nav('/profile', { replace: true })
        return
      }

      // Try restoring a local draft (only if not complete)
      setTimeout(() => {
        const d = loadDraftIfAny()
        if (d) {
          setStep(d.step ?? 0)
          setHandle(d.handle ?? '')
          setDisplayName(d.displayName ?? '')
          setLocation(d.location ?? '')
          setBio(d.bio ?? '')
          setPublicProfile(typeof d.publicProfile === 'boolean' ? d.publicProfile : true)
          setAvatarUrl(d.avatarUrl ?? '')
          setInterests(Array.isArray(d.interests) ? d.interests : [])
          setNotice('Draft restored.')
          setTimeout(() => setNotice(''), 1200)
        }
        setLoading(false)
      }, 0)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s?.user) { setMe(null); setError('Please sign in to continue.') } else { setMe(s.user) }
    })

    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [nav])

  // ===== Debounced handle availability check =====
  useEffect(() => {
    if (!me?.id) return
    setError(''); setNotice('')

    const h = normalizedHandle
    if (!h || h.length < 3 || !/^[a-z0-9_]+$/.test(h)) {
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
    }, 350)

    return () => { if (checkTimer.current) clearTimeout(checkTimer.current) }
  }, [normalizedHandle, me])

  // ===== Step auto-focus & hotkeys =====
  useEffect(() => {
    const focus = (el) => { try { el?.focus() } catch {} }

    if (step === 1) {
      focus(avatarStepStartRef.current)
    } else if (step === 2) {
      if (!handleValid) focus(handleInputRef.current)
      else focus(displayNameRef.current)
    } else if (step === 3) {
      focus(interestsFirstFocusableRef.current)
    }

    function onKeyDown(e) {
      const esc = e.key === 'Escape'
      if (esc && step > 0) {
        e.preventDefault()
        if (step === 1) setStep(0)
        if (step === 2) setStep(1)
        if (step === 3) setStep(2)
        return
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        const active = document.activeElement
        const isBio = active && active.getAttribute('aria-label') === 'bio-textarea'
        if (isBio) return

        if (step === 1) { e.preventDefault(); nextFromAvatar(); return }
        if (step === 2) {
          if (handleValid && !bioTooLong) { e.preventDefault(); nextFromBasics() }
          return
        }
        if (step === 3) {
          if (canSave) {
            e.preventDefault()
            const btn = document.getElementById('onb-save-btn')
            btn?.click()
          }
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, handleValid, bioTooLong, canSave])

  // When handle transitions invalid→valid, move focus once
  const lastHandleValidRef = useRef(false)
  useEffect(() => {
    if (!lastHandleValidRef.current && handleValid) {
      try { displayNameRef.current?.focus() } catch {}
    }
    lastHandleValidRef.current = handleValid
  }, [handleValid])

  // ===== Auto-save draft on any relevant change =====
  useEffect(() => { saveDraftDebounced() },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftKey, step, handle, displayName, location, bio, publicProfile, avatarUrl, JSON.stringify(interests)]
  )
  // Also save when unmounting
  useEffect(() => {
    return () => { if (draftSaveTimer.current) { clearTimeout(draftSaveTimer.current); saveDraftImmediate() } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ===== Actions =====
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
    if (!handleValid) { setError('Please choose a valid, available handle.'); return }
    if (bioTooLong) { setError('Bio is too long.'); return }
    setError('')
    setStep(3)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setNotice('')

    if (!me?.id) { setError('Please sign in first.'); return }
    if (!handleValid) { setError('Please choose a valid, available handle.'); return }
    if (!interestsValid) { setError('Please add at least one interest.'); return }
    if (bioTooLong) { setError('Bio is too long.'); return }

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

    clearDraft() // ✅ clear saved draft on success

    setNotice('Saved! Redirecting to your profile…')
    setSaving(false)
    setTimeout(() => nav('/profile'), 600)
  }

  // Top visual progress (line) + numbered stepper
  const progressPct = Math.max(0, Math.min(100, Math.round((step / (TOTAL_STEPS - 1)) * 100)))
  const Stepper = () => (
    <div style={{ position:'sticky', top:0, zIndex:5, background:'transparent' }}>
      <div style={{ height: 4, width: '100%', background: '#eee' }}>
        <div
          style={{
            height: 4,
            width: `${progressPct}%`,
            background: 'var(--primary)',
            transition: 'width 240ms ease'
          }}
        />
      </div>
      <div
        style={{
          display:'grid',
          gridTemplateColumns:`repeat(${TOTAL_STEPS}, 1fr)`,
          gap:8,
          padding:'10px 0',
          maxWidth: 940,
          margin: '0 auto'
        }}
      >
        {STEP_LABELS.map((label, idx) => {
          const active = idx === step
          const done = idx < step
          const canClick = idx <= step
          return (
            <button
              key={label}
              onClick={() => { if (canClick) setStep(idx) }}
              title={label}
              disabled={!canClick}
              style={{
                display:'flex',
                alignItems:'center',
                gap:10,
                justifyContent:'center',
                padding:'8px 6px',
                border:'1px solid var(--border)',
                borderRadius:10,
                background: active
                  ? 'color-mix(in oklab, var(--primary), #ffffff 85%)'
                  : done
                    ? 'color-mix(in oklab, var(--primary), #ffffff 92%)'
                    : '#fff',
                color:'#111',
                cursor: canClick ? 'pointer' : 'not-allowed'
              }}
            >
              <span style={{
                display:'inline-grid',
                placeItems:'center',
                width:24, height:24,
                borderRadius:20,
                border: '1px solid var(--border)',
                background: active || done ? 'var(--primary)' : '#fff',
                color: active || done ? '#fff' : '#333',
                fontWeight: 700,
                fontSize: 12
              }}>{idx+1}</span>
              <span style={{ fontWeight: active ? 800 : 600, color: active ? 'var(--primary)' : undefined }}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

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
      <>
        <Stepper />
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
      </>
    )
  }

  // STEP 1: Avatar
  if (step === 1) {
    return (
      <>
        <Stepper />
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

          {/* Invisible anchor for focus start */}
          <button ref={avatarStepStartRef} style={{ position:'absolute', left:-9999, top:-9999 }} aria-hidden />

          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => setStep(0)}>Back (Esc)</button>
            <button className="btn btn-primary" onClick={nextFromAvatar}>Next (Enter)</button>
            <button className="btn" onClick={() => { setAvatarUrl(''); nextFromAvatar() }}>Skip for now</button>
          </div>
        </div>
      </>
    )
  }

  // STEP 2: Handle & Basics
  if (step === 2) {
    const handleHelp = (() => {
      if (!handleDirty) return 'Letters, numbers, underscore. 3–24 characters.'
      if (handleTooShort) return 'Handle must be at least 3 characters.'
      if (!/^[a-z0-9_]+$/.test(normalizedHandle)) return 'Only lowercase letters, numbers, and underscore allowed.'
      if (checkingHandle) return 'Checking availability…'
      if (handleTaken) return 'That handle is taken — try another.'
      if (handleValid) return 'Looks good! Your handle is available.'
      return 'Letters, numbers, underscore. 3–24 characters.'
    })()

    return (
      <>
        <Stepper />
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
                {handleValid && <span title="Available" style={{ color: 'green', fontSize: 12 }}>✓ available</span>}
                {handleTaken && !checkingHandle && <span style={{ color: '#b91c1c', fontSize: 12 }}>✗ taken</span>}
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--muted)' }}>@</span>
                <input
                  ref={handleInputRef}
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="yourname"
                  aria-label="handle"
                  style={{
                    borderColor:
                      handleValid ? 'rgba(0,128,0,0.65)' :
                      (handleDirty && !checkingHandle && (handleTooShort || handleTaken || !handleValidFormat))
                        ? '#e11d48'
                        : undefined,
                    boxShadow:
                      handleValid ? '0 0 0 2px rgba(0,128,0,0.15)' :
                      (handleDirty && !checkingHandle && (handleTooShort || handleTaken || !handleValidFormat))
                        ? '0 0 0 2px rgba(225,29,72,0.15)'
                        : undefined
                  }}
                />
              </div>
              <div style={{
                fontSize: 12,
                marginTop: 4,
                color: handleValid ? 'green' : (handleTaken || handleTooShort || !handleValidFormat) ? '#b91c1c' : 'var(--muted)'
              }}>
                {handleHelp}
              </div>
            </div>

            {/* Display name */}
            <div>
              <label style={{ fontWeight: 700 }}>
                Display name <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                ref={displayNameRef}
                value={displayName}
                onChange={(e)=>setDisplayName(e.target.value)}
                placeholder="How you want to appear"
              />
            </div>

            {/* Location */}
            <div>
              <label style={{ fontWeight: 700 }}>
                Location <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                ref={locationRef}
                value={location}
                onChange={(e)=>setLocation(e.target.value)}
                placeholder="City, State"
              />
            </div>

            {/* Bio */}
            <div>
              <label style={{ fontWeight: 700 }}>
                Short bio <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                ref={bioRef}
                rows={3}
                maxLength={BIO_MAX}
                value={bio}
                onChange={(e)=>setBio(e.target.value)}
                placeholder="A sentence or two"
                aria-label="bio-textarea"
                style={{
                  resize:'vertical',
                  borderColor: bioTooLong ? '#e11d48' : undefined,
                  boxShadow: bioTooLong ? '0 0 0 2px rgba(225,29,72,0.15)' : undefined
                }}
              />
              <div style={{
                fontSize: 12,
                color: bioTooLong ? '#b91c1c' : bioNearLimit ? '#92400e' : 'var(--muted)',
                marginTop: 4
              }}>
                {bioTooLong ? `${bioLen}/${BIO_MAX} — too long` :
                 bioNearLimit ? `${bioLen}/${BIO_MAX} — near the limit` :
                 `${bioLen}/${BIO_MAX}`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" type="button" onClick={() => setStep(1)}>Back (Esc)</button>
              <button className="btn btn-primary" type="submit" disabled={!handleValid || bioTooLong}>
                Next (Enter)
              </button>
            </div>
          </form>
        </div>
      </>
    )
  }

  // STEP 3: Interests & Visibility (final save)
  const previewPublicUrl = normalizedHandle ? `/u/${normalizedHandle}` : null

  return (
    <>
      <Stepper />
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
          <InterestsPicker
            value={interests}
            onChange={setInterests}
            max={8}
            firstFocusableRef={interestsFirstFocusableRef}
          />
          {!interestsValid && (
            <div style={{ fontSize: 12, color:'#b91c1c' }}>
              Please add at least one interest.
            </div>
          )}

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
            <button className="btn" type="button" onClick={() => setStep(2)} disabled={saving}>Back (Esc)</button>
            <button id="onb-save-btn" className="btn btn-primary" type="submit" disabled={!canSave}>
              {saving ? 'Saving…' : 'Save & Continue (Enter)'}
            </button>
            <button className="btn" type="button" onClick={()=>nav('/profile')} disabled={saving}>
              Skip for now
            </button>
          </div>
        </form>
      </div>

      {/* Tiny "Draft saved" hint */}
      {savedHint && (
        <div style={{
          position:'fixed', left:12, bottom:12, padding:'6px 10px',
          border:'1px solid #e5e7eb', background:'#fff', borderRadius:8,
          boxShadow:'0 6px 20px rgba(0,0,0,0.10)', fontSize:12, color:'#374151'
        }}>
          Draft saved
        </div>
      )}
    </>
  )
}

function guessHandleFromEmail(email) {
  if (!email) return ''
  const base = email.split('@')[0] || ''
  return base.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, HANDLE_MAX)
}








