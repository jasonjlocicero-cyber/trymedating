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
  const [birthdate, setBirthdate] = useState('') // 'YYYY-MM-DD'
  const [interestsStr, setInterestsStr] = useState('')

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

  // reserved handles
  const RESERVED = useRef(new Set([
    'admin','administrator','support','moderator',
    'help','root','system','trymedating','api','www','null'
  ]))

  // helpers
  function normalizeHandle(v) {
    return v.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 32)
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

  const interestsArray = useMemo(() => {
    const arr = interestsStr.split(',').map(s => s.trim()).filter(Boolean)
    return Array.from(new Set(arr)).slice(0, 12)
  }, [interestsStr])

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
          setInterestsStr(arr.join(', '))
        }
      } catch (e) {
        if (!cancel) setErr(e.message || 'Failed to load profile')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [authed, me?.id])

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

      const interestsArr = interestsStr.split(',').map(s => s.trim()).filter(Boolean)
      const sanitizedInterests = Array.from(new Set(interestsArr)).slice(0, 12)

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
      showToast('Profile saved ✓')
    } catch (e) {
      setErr(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
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
    { key: 'interests',   label: 'Interests',     done: (interestsArray.length > 0) },
  ]
  const completeCount = completenessItems.filter(i => i.done).length
  const completePct = Math.round((completeCount / completenessItems.length) * 100)

  return (
    <main className="container" style={{ padding: 24, maxWidth: 860 }}>
      <h1 style={{ marginBottom: 8 }}>Profile</h1>

      {/* Completeness */}
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap: 12, flexWrap:'wrap' }}>
          <div style={{ fontWeight: 700 }}>Profile completeness: {completePct}%</div>
          <div style={{ minWidth: 180, flex: 1 }}>
            <div className="progress">
              <div className="progress__bar" style={{ width: `${completePct}%` }} />
            </div>
          </div>
        </div>
        <div className="checklist">
          {completenessItems.map(item => (
            <span
              key={item.key}
              className={`checklist__item ${item.done ? 'checklist__item--done' : ''}`}
              title={item.done ? 'Completed' : 'Not yet'}
            >
              {item.done ? <span className="checkmark">✓</span> : <span style={{ width:16 }} />}
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
        >
          Your profile is <strong>private</strong>. Others can’t view it unless you make it public.
        </div>
      )}

      {needsOnboarding && (
        <div
          className="card"
          style={{ padding:12, borderLeft:'4px solid var(--brand-coral)', marginBottom:12, background:'#fffaf7' }}
        >
          <strong>Finish your setup:</strong> add a display name and handle, and an optional photo.
        </div>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {/* ================== Edit Form ================== */}
          <form onSubmit={saveProfile} className="card profile-form">
            {err && <div className="helper-error">{err}</div>}
            {ok && <div className="helper-success">{ok}</div>}

            {/* Avatar */}
            <section>
              <div className="field-label">Photo</div>
              <AvatarUploader userId={me.id} value={avatarUrl} onChange={setAvatarUrl} />
            </section>

            {/* Display name */}
            <label>
              <div className="field-label">Display name</div>
              <input
                value={displayName}
                onChange={(e)=>setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </label>

            {/* Handle + validation */}
            <label>
              <div className="field-label">Handle</div>
              <input
                value={handle}
                onChange={(e)=>setHandle(normalizeHandle(e.target.value))}
                placeholder="your-handle"
                style={{
                  borderColor: handleOk === false ? '#b91c1c'
                    : handleOk === true ? '#16a34a'
                    : 'var(--border)'
                }}
              />
              {publicProfile ? (
                handleOk === true ? (
                  <div className="helper-success">✓ Handle available</div>
                ) : handleOk === false ? (
                  <div className="helper-error">Handle already taken</div>
                ) : (
                  <div className="helper-muted">
                    {handleMsg || 'Public URL: ' + (handle ? `/u/${handle}` : '/u/your-handle')}
                  </div>
                )
              ) : (
                <div className="helper-muted">
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
            </label>

            {/* Bio */}
            <label>
              <div className="field-label">Bio</div>
              <textarea
                value={bio}
                onChange={(e)=>setBio(e.target.value)}
                placeholder="A short intro…"
                rows={4}
                maxLength={300}
                style={{ resize:'vertical' }}
              />
              <div className="helper-muted">
                {bio.length}/300 characters
              </div>
            </label>

            {/* Location */}
            <label>
              <div className="field-label">Location</div>
              <input
                value={location}
                onChange={(e)=>setLocation(e.target.value)}
                placeholder="City, State (or City, Country)"
              />
            </label>

            {/* Birthdate */}
            <label>
              <div className="field-label">Birthdate</div>
              <input
                type="date"
                value={birthdate || ''}
                onChange={(e)=>{ setBirthdate(e.target.value); setBirthErr('') }}
                onBlur={(e)=>validateBirthdate(e.target.value)}
              />
              {birthErr ? (
                <div className="helper-error">{birthErr}</div>
              ) : age ? (
                <div className="helper-success">✓ Age: {age}</div>
              ) : (
                <div className="helper-muted">We use this only to show your age.</div>
              )}
            </label>

            {/* Interests */}
            <label>
              <div className="field-label">Interests</div>
              <input
                value={interestsStr}
                onChange={(e)=>setInterestsStr(e.target.value)}
                placeholder="hiking, live music, sushi, travel"
              />
              <div className="helper-muted">
                Separate with commas. We’ll show them as tags on your public profile. (Max 12)
              </div>
            </label>

            {/* Public toggle */}
            <label style={{ display:'flex', alignItems:'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={publicProfile}
                onChange={(e)=>setPublicProfile(e.target.checked)}
              />
              <span>Make my profile public</span>
            </label>

            {/* Actions */}
            <div className="actions-row">
              <button
                className="btn btn-header"
                type="submit"
                disabled={saving || (publicProfile && (handleOk === false || checkingHandle))}
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
              {publicProfile && handle && (
                <a href={`/u/${handle}`} className="btn btn-neutral">View public profile</a>
              )}
            </div>

            {/* Invite QR + Copy buttons */}
            <section className="card" style={{ padding:12, marginTop: 4 }}>
              <div className="qr-row">
                <div>
                  <div style={{ fontWeight:800, marginBottom:4 }}>Your invite QR</div>
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
                <div className="qr-card">
                  <QRCode value={inviteUrl} size={120} />
                </div>
              </div>
            </section>

            {/* ================== End Edit Form ================== */}
          </form>
        </>
      )}

      {/* Toast container */}
      <div style={{position:'fixed',top:16,right:16,display:'flex',flexDirection:'column',gap:8,zIndex:9999}}>
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
















