// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import AvatarUploader from '../components/AvatarUploader'
import QRCode from 'react-qr-code'
import { Link } from 'react-router-dom'

export default function ProfilePage({ me }) {
  const authed = !!me?.id

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false) // flash "Saved ✓"
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  // core profile fields
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [publicProfile, setPublicProfile] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)

  // extra fields
  const [location, setLocation] = useState('')
  const [birthdate, setBirthdate] = useState('') // YYYY-MM-DD

  // interests as chips
  const [interests, setInterests] = useState([])        // array of strings
  const [interestInput, setInterestInput] = useState('')// current input text
  const MAX_INTERESTS = 12

  // validation helpers
  const [birthErr, setBirthErr] = useState('')
  const [handleMsg, setHandleMsg] = useState('')
  const [handleOk, setHandleOk] = useState(null) // true/false/null
  const [checkingHandle, setCheckingHandle] = useState(false)

  // toasts
  const [toasts, setToasts] = useState([])

  // onboarding nudge
  const needsOnboarding = useMemo(
    () => authed && (!displayName || !handle),
    [authed, displayName, handle]
  )

  // Focus refs for a11y-first onboarding
  const nameRef = useRef(null)
  const handleRef = useRef(null)

  // reserved handles
  const RESERVED = useRef(new Set([
    'admin','administrator','support','moderator',
    'help','root','system','trymedating','api','www','null'
  ]))

  // helpers
  function normalizeHandle(v) {
    return v.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 32)
  }
  function initials() {
    const s = (displayName || handle || '?').trim()
    return s ? s[0].toUpperCase() : '?'
  }

  const age = useMemo(() => {
    if (!birthdate) return ''
    const d = new Date(birthdate + 'T00:00:00')
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    let a = now.getFullYear() - d.getFullYear()
    const m = now.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
    if (a < 0 || a > 120) return ''
    return a
  }, [birthdate])

  // Load profile from Supabase
  useEffect(() => {
    let cancel = false
    if (!authed) { setLoading(false); return }
    ;(async () => {
      setLoading(true); setErr(''); setOk('')
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select(`
            display_name, handle, bio, public_profile, avatar_url,
            location, birthdate, interests
          `)
          .eq('user_id', me.id)
          .maybeSingle()
        if (error) throw error
        if (!cancel && data) {
          setDisplayName(data.display_name || '')
          setHandle(data.handle || '')
          setBio(data.bio || '')
          setPublicProfile(!!data.public_profile)
          setAvatarUrl(data.avatar_url || null)
          setLocation(data.location || '')
          setBirthdate(data.birthdate || '')
          const arr = Array.isArray(data.interests) ? data.interests : []
          setInterests(arr.slice(0, MAX_INTERESTS))
        }
      } catch (e) {
        if (!cancel) setErr(e.message || 'Failed to load profile')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [authed, me?.id])

  // After load, auto-focus first missing field for smoother onboarding
  useEffect(() => {
    if (!loading && authed) {
      if (!displayName && nameRef.current) nameRef.current.focus()
      else if (!handle && handleRef.current) handleRef.current.focus()
    }
  }, [loading, authed, displayName, handle])

  // local validators
  function validateHandleLocal(v) {
    const clean = v.toLowerCase()
    if (!clean) return { ok: false, msg: 'Handle is required when public.' }
    if (clean.length < 3) return { ok: false, msg: 'Minimum 3 characters.' }
    if (clean.length > 32) return { ok: false, msg: 'Maximum 32 characters.' }
    if (!/^[a-z0-9-_]+$/.test(clean)) return { ok: false, msg: 'Use lowercase letters, numbers, - or _ only.' }
    if (RESERVED.current.has(clean)) return { ok: false, msg: 'That handle is reserved.' }
    return { ok: true, msg: '' }
  }

  function validateBirthdate(v) {
    if (!v) { setBirthErr(''); return true }
    const d = new Date(v + 'T00:00:00')
    if (isNaN(d.getTime())) { setBirthErr('Invalid date.'); return false }
    const now = new Date()
    if (d > now) { setBirthErr('Birthdate cannot be in the future.'); return false }
    const years = now.getFullYear() - d.getFullYear()
    if (years < 18) { setBirthErr('You must be at least 18.'); return false }
    if (years > 120) { setBirthErr('Please enter a valid birthdate.'); return false }
    setBirthErr('')
    return true
  }

  // live handle check
  useEffect(() => {
    if (!authed) return
    const value = handle?.trim() || ''
    const local = validateHandleLocal(value)
    if (!local.ok) {
      setHandleOk(false)
      setHandleMsg(local.msg)
      return
    }
    if (!value) {
      setHandleOk(null); setHandleMsg(''); return
    }
    setCheckingHandle(true)
    setHandleMsg('Checking availability…')
    setHandleOk(null)

    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('handle', value)
          .neq('user_id', me.id)
          .maybeSingle()
        if (error) throw error
        if (data) {
          setHandleOk(false)
          setHandleMsg('Handle already taken')
        } else {
          setHandleOk(true)
          setHandleMsg('✓ Handle available')
        }
      } catch {
        setHandleOk(null)
        setHandleMsg('Could not verify handle right now.')
      } finally {
        setCheckingHandle(false)
      }
    }, 350)

    return () => clearTimeout(t)
  }, [handle, authed, me?.id])

  // interests helpers
  function addInterestFromInput() {
    const raw = interestInput.trim()
    if (!raw) return
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
    let next = [...interests]
    for (const p of parts) {
      if (next.length >= MAX_INTERESTS) break
      const clean = p.slice(0, 32)
      if (!next.includes(clean)) next.push(clean)
    }
    setInterests(next)
    setInterestInput('')
  }
  function removeInterest(i) {
    setInterests(interests.filter((_, idx) => idx !== i))
  }
  function onInterestKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addInterestFromInput()
    }
    if (e.key === 'Backspace' && !interestInput && interests.length) {
      e.preventDefault()
      setInterests(interests.slice(0, -1))
    }
  }

  // save profile
  async function saveProfile(e) {
    e?.preventDefault?.()
    if (!authed) return
    setSaving(true); setErr(''); setOk('')
    try {
      if (!validateBirthdate(birthdate)) throw new Error(birthErr || 'Invalid birthdate.')

      if (publicProfile) {
        const local = validateHandleLocal(handle.trim())
        if (!local.ok) throw new Error(local.msg)
        const { data: dupe } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('handle', handle.trim())
          .neq('user_id', me.id)
          .maybeSingle()
        if (dupe) throw new Error('That handle is already taken.')
      }

      const sanitizedInterests = Array.from(new Set(interests.map(s => s.trim()).filter(Boolean))).slice(0, MAX_INTERESTS)

      const payload = {
        user_id: me.id,
        display_name: displayName || null,
        handle: handle ? normalizeHandle(handle) : null,
        bio: bio || null,
        public_profile: publicProfile,
        avatar_url: avatarUrl || null,
        location: location || null,
        birthdate: birthdate || null,
        interests: sanitizedInterests.length ? sanitizedInterests : null
      }

      const { error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'user_id' })
      if (error) throw error

      setOk('Profile saved')
      announce(`Profile saved`) // screen reader friendly
      showToast('Profile saved ✓')

      setJustSaved(true)
      const t = setTimeout(() => setJustSaved(false), 2000)
      return () => clearTimeout(t)
    } catch (e) {
      setErr(e.message || 'Save failed')
      announce('Save failed')
    } finally {
      setSaving(false)
    }
  }

  // live region announcer
  const srAnnouncerRef = useRef(null)
  function announce(msg) {
    if (!srAnnouncerRef.current) return
    srAnnouncerRef.current.textContent = ''   // reset to retrigger
    setTimeout(() => {
      if (srAnnouncerRef.current) srAnnouncerRef.current.textContent = msg
    }, 20)
  }

  // toasts
  function showToast(msg) {
    const id = Date.now()
    setToasts(t => [...t, { id, msg }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2000)
  }
  function copyText(text, label) {
    navigator.clipboard.writeText(text)
    showToast(`${label} copied!`)
    announce(`${label} copied`)
  }

  if (!authed) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1>Profile</h1>
        <p>Please <Link to="/auth">sign in</Link> to edit your profile.</p>
      </div>
    )
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = handle ? `${origin}/u/${handle}` : ''
  const inviteUrl = `${origin}/auth?invite=${encodeURIComponent(me.id)}`

  // ---------- completeness ----------
  const completenessItems = [
    { key: 'displayName', label: 'Display name', done: !!displayName?.trim() },
    { key: 'handle',      label: 'Handle',        done: !!handle?.trim() },
    { key: 'avatarUrl',   label: 'Photo',         done: !!avatarUrl },
    { key: 'bio',         label: 'Bio',           done: (bio?.trim()?.length || 0) >= 10 },
    { key: 'location',    label: 'Location',      done: !!location?.trim() },
    { key: 'birthdate',   label: 'Birthdate',     done: !!birthdate },
    { key: 'interests',   label: 'Interests',     done: (interests.length > 0) },
  ]
  const completeCount = completenessItems.filter(i => i.done).length
  const completePct = Math.round((completeCount / completenessItems.length) * 100)

  // IDs for aria-describedby hooks
  const ids = {
    nameHelp: 'name-help',
    handleHelp: 'handle-help',
    bioHelp: 'bio-help',
    birthHelp: 'birth-help',
    locHelp: 'loc-help',
    interestsHelp: 'interests-help'
  }

  return (
    <main className="container profile-narrow" style={{ padding: 24 }}>
      {/* Screen reader live region (polite) */}
      <div
        ref={srAnnouncerRef}
        aria-live="polite"
        aria-atomic="true"
        style={{ position:'absolute', left:-9999, width:1, height:1, overflow:'hidden' }}
      />

      <h1 style={{ marginBottom: 8 }}>Profile</h1>

      {/* Completeness */}
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap: 12, flexWrap:'wrap' }}>
          <div style={{ fontWeight: 700 }}>Profile completeness: {completePct}%</div>
          <div style={{ minWidth: 180, flex: 1 }}>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completePct} aria-label="Profile completeness">
              <div className="progress__bar" style={{ width: `${completePct}%` }} />
            </div>
          </div>
        </div>
        <div className="checklist" aria-label="Profile checklist">
          {completenessItems.map(item => (
            <span
              key={item.key}
              className={`checklist__item ${item.done ? 'checklist__item--done' : ''}`}
              title={item.done ? 'Completed' : 'Not yet'}
              aria-checked={item.done}
              role="checkbox"
              tabIndex={0}
            >
              {item.done ? <span className="checkmark" aria-hidden>✓</span> : <span style={{ width:16 }} aria-hidden />}
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {!publicProfile && (
        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 12,
            background: '#fff8e1',
            border: '1px solid var(--border)',
            borderLeft: '4px solid #f59e0b',
            color: '#5b4b1e'
          }}
          role="status"
          aria-live="polite"
        >
          Your profile is <strong>private</strong>. Others can’t view it unless you make it public.
        </div>
      )}

      {needsOnboarding && (
        <div
          className="card"
          style={{ padding:12, borderLeft:'4px solid var(--brand-coral)', marginBottom:12, background:'#fffaf7' }}
          role="status"
          aria-live="polite"
        >
          <strong>Finish your setup:</strong> add a display name and handle, and an optional photo.
        </div>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {/* ================== Edit Form ================== */}
          <form onSubmit={saveProfile} className="card profile-form" aria-label="Edit profile">
            {err && <div className="helper-error" role="alert">{err}</div>}
            {ok && <div className="helper-success" role="status" aria-live="polite">{ok}</div>}

            {/* Photo row: Uploader + live preview bubble */}
            <section aria-labelledby="photo-label">
              <div id="photo-label" className="section-title">Photo</div>
              <div className="row-split">
                <AvatarUploader userId={me.id} value={avatarUrl} onChange={setAvatarUrl} />
                <div>
                  <div className="avatar-frame" aria-label="Avatar preview">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={displayName || handle || 'avatar'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div className="avatar-initials" aria-hidden>
                        {initials()}
                      </div>
                    )}
                  </div>
                  <div className="helper-muted" style={{ textAlign:'center', marginTop:6 }}>
                    Profile preview
                  </div>
                </div>
              </div>
            </section>

            {/* Display name */}
            <label htmlFor="displayNameInput">
              <div className="field-label">Display name</div>
            </label>
            <input
              id="displayNameInput"
              ref={nameRef}
              value={displayName}
              onChange={(e)=>setDisplayName(e.target.value)}
              placeholder="Your name"
              aria-describedby={ids.nameHelp}
            />
            <div id={ids.nameHelp} className="helper-muted">This is shown on your profile.</div>

            {/* Handle + validation */}
            <label htmlFor="handleInput">
              <div className="field-label">Handle</div>
            </label>
            <input
              id="handleInput"
              ref={handleRef}
              value={handle}
              onChange={(e)=>setHandle(normalizeHandle(e.target.value))}
              placeholder="your-handle"
              style={{
                borderColor: handleOk === false ? '#b91c1c'
                  : handleOk === true ? '#16a34a'
                  : 'var(--border)'
              }}
              aria-invalid={publicProfile && handleOk === false ? true : undefined}
              aria-describedby={ids.handleHelp}
            />
            {publicProfile ? (
              handleOk === true ? (
                <div id={ids.handleHelp} className="helper-success">✓ Handle available</div>
              ) : handleOk === false ? (
                <div id={ids.handleHelp} className="helper-error">Handle already taken</div>
              ) : (
                <div id={ids.handleHelp} className="helper-muted">
                  {handleMsg || 'Public URL: ' + (handle ? `/u/${handle}` : '/u/your-handle')}
                </div>
              )
            ) : (
              <div id={ids.handleHelp} className="helper-muted">
                {handleMsg || 'Handle is optional until you go public.'}
              </div>
            )}

            {publicProfile && handleOk && handle && (
              <button
                type="button"
                className="btn btn-neutral"
                style={{ marginTop:6 }}
                onClick={() => copyText(publicUrl,'Public URL')}
              >
                Copy Public URL
              </button>
            )}

            {/* Bio */}
            <label htmlFor="bioInput">
              <div className="field-label">Bio</div>
            </label>
            <textarea
              id="bioInput"
              value={bio}
              onChange={(e)=>setBio(e.target.value)}
              placeholder="A short intro…"
              rows={4}
              maxLength={300}
              style={{ resize:'vertical' }}
              aria-describedby={ids.bioHelp}
            />
            <div id={ids.bioHelp} className="helper-muted">
              {bio.length}/300 characters
            </div>

            {/* Location */}
            <label htmlFor="locationInput">
              <div className="field-label">Location</div>
            </label>
            <input
              id="locationInput"
              value={location}
              onChange={(e)=>setLocation(e.target.value)}
              placeholder="City, State (or City, Country)"
              aria-describedby={ids.locHelp}
            />
            <div id={ids.locHelp} className="helper-muted">Optional, helps locals find you.</div>

            {/* Birthdate */}
            <label htmlFor="birthInput">
              <div className="field-label">Birthdate</div>
            </label>
            <input
              id="birthInput"
              type="date"
              value={birthdate || ''}
              onChange={(e)=>{ setBirthdate(e.target.value); setBirthErr('') }}
              onBlur={(e)=>validateBirthdate(e.target.value)}
              aria-invalid={!!birthErr || undefined}
              aria-describedby={ids.birthHelp}
            />
            {birthErr ? (
              <div id={ids.birthHelp} className="helper-error">{birthErr}</div>
            ) : age ? (
              <div id={ids.birthHelp} className="helper-success">✓ Age: {age}</div>
            ) : (
              <div id={ids.birthHelp} className="helper-muted">We use this only to show your age.</div>
            )}

            {/* Interests (chips) */}
            <section aria-labelledby="interests-label">
              <div id="interests-label" className="field-label">
                Interests <span className="helper-inline">({interests.length}/{MAX_INTERESTS})</span>
              </div>

              {/* Current chips */}
              <div className="chips" aria-live="polite">
                {interests.map((tag, i) => (
                  <span key={tag + i} className="chip">
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      onClick={() => removeInterest(i)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {interests.length === 0 && (
                  <span className="helper-muted">Add a few like “hiking”, “live music”, “sushi”, “travel”.</span>
                )}
              </div>

              {/* Input to add new interests */}
              <div className="interest-input-wrap">
                <input
                  id="interestInput"
                  value={interestInput}
                  onChange={(e)=>setInterestInput(e.target.value)}
                  onKeyDown={onInterestKeyDown}
                  placeholder="Type an interest and press Enter"
                  aria-describedby={ids.interestsHelp}
                  disabled={interests.length >= MAX_INTERESTS}
                />
                <button
                  type="button"
                  className="btn btn-neutral"
                  onClick={addInterestFromInput}
                  disabled={!interestInput.trim() || interests.length >= MAX_INTERESTS}
                  aria-label="Add interest"
                >
                  Add
                </button>
              </div>
              <div id={ids.interestsHelp} className="helper-muted" style={{ marginTop: 4 }}>
                Max {MAX_INTERESTS}. Press Enter or comma to add. Backspace removes the last chip when the input is empty.
              </div>
            </section>

            {/* Public toggle */}
            <label style={{ display:'flex', alignItems:'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={publicProfile}
                onChange={(e)=>setPublicProfile(e.target.checked)}
                aria-label="Make my profile public"
              />
              <span>Make my profile public</span>
            </label>

            {/* Actions */}
            <div className="actions-row">
              <button
                className="btn btn-header"
                type="submit"
                disabled={saving || justSaved || (publicProfile && (handleOk === false || checkingHandle))}
                aria-live="polite"
              >
                {saving ? 'Saving…' : justSaved ? 'Saved ✓' : 'Save profile'}
              </button>
              {publicProfile && handle && (
                <a href={`/u/${handle}`} className="btn btn-neutral">View public profile</a>
              )}
            </div>

            {/* Invite QR + Copy buttons */}
            <section className="card" style={{ padding:12, marginTop: 4 }}>
              <div className="qr-wrap">
                <div>
                  <div className="section-title">Your invite QR</div>
                  <div className="helper-muted">
                    Share in person. Scanning sends people to: <code>/auth?invite=…</code>
                  </div>
                  <div className="actions-row" style={{ marginTop:8 }}>
                    <button
                      type="button"
                      className="btn btn-neutral"
                      onClick={() => copyText(inviteUrl,'Invite link')}
                    >
                      Copy Invite Link
                    </button>
                    {publicProfile && handleOk && handle && (
                      <button
                        type="button"
                        className="btn btn-neutral"
                        onClick={() => copyText(publicUrl,'Public URL')}
                      >
                        Copy Public URL
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="qr-card" aria-label="Invite QR code">
                    <QRCode value={inviteUrl} size={128} />
                  </div>
                  <div className="qr-caption">Scan to join via your invite</div>
                </div>
              </div>
            </section>

            {/* ================== End Edit Form ================== */}
          </form>
        </>
      )}

      {/* Toast container (assertive for quick alerts) */}
      <div
        style={{position:'fixed',top:16,right:16,display:'flex',flexDirection:'column',gap:8,zIndex:9999}}
        role="region"
        aria-live="assertive"
        aria-label="Notifications"
      >
        {toasts.map(t => <Toast key={t.id} msg={t.msg} />)}
      </div>
    </main>
  )
}

function Toast({ msg }) {
  return (
    <div style={{
      background:'#333',
      color:'#fff',
      padding:'8px 14px',
      borderRadius:8,
      fontSize:14,
      boxShadow:'0 2px 6px rgba(0,0,0,0.25)'
    }}>
      {msg}
    </div>
  )
}


















