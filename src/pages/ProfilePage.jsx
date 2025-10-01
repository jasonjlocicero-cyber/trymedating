// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import AvatarUploader from '../components/AvatarUploader'
import QRCode from 'react-qr-code'

export default function ProfilePage({ me }) {
  const authed = !!me?.id

  // ui state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  // model (existing)
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [publicProfile, setPublicProfile] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)

  // extra fields
  const [location, setLocation] = useState('')
  const [birthdate, setBirthdate] = useState('') // 'YYYY-MM-DD'
  const [pronouns, setPronouns] = useState('')
  const [interestsStr, setInterestsStr] = useState('') // UI as comma-separated
  const [birthErr, setBirthErr] = useState('')

  // handle validation state
  const [handleMsg, setHandleMsg] = useState('')
  const [handleOk, setHandleOk] = useState(null)      // true | false | null
  const [checkingHandle, setCheckingHandle] = useState(false)

  // toast queue
  const [toasts, setToasts] = useState([])

  // derived flags
  const needsOnboarding = useMemo(
    () => authed && (!displayName || !handle),
    [authed, displayName, handle]
  )

  // reserved handles
  const RESERVED = useRef(new Set([
    'admin','administrator','support','moderator',
    'help','root','system','trymedating','api','www','null'
  ]))

  // normalize handle
  function normalizeHandle(v) {
    return v.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 32)
  }

  // compute age from birthdate
  const age = useMemo(() => {
    if (!birthdate) return ''
    const d = new Date(birthdate + 'T00:00:00') // avoid TZ issues
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    let a = now.getFullYear() - d.getFullYear()
    const m = now.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
    if (a < 0 || a > 120) return ''
    return a
  }, [birthdate])

  // split interests for preview
  const interestsArray = useMemo(() => {
    const arr = interestsStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    // cap at 12 for display
    return Array.from(new Set(arr)).slice(0, 12)
  }, [interestsStr])

  // Load current profile (includes extra fields)
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
            location, birthdate, pronouns, interests
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
          setPronouns(data.pronouns || '')
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

  // local validation helpers
  function validateHandleLocal(v, reservedSet) {
    const clean = v.toLowerCase()
    if (!clean) return { ok: false, msg: 'Handle is required when public.' }
    if (clean.length < 3) return { ok: false, msg: 'Minimum 3 characters.' }
    if (clean.length > 32) return { ok: false, msg: 'Maximum 32 characters.' }
    if (!/^[a-z0-9-_]+$/.test(clean)) return { ok: false, msg: 'Use lowercase letters, numbers, - or _ only.' }
    if (reservedSet.has(clean)) return { ok: false, msg: 'That handle is reserved.' }
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

  // live handle validation + server check
  useEffect(() => {
    if (!authed) return
    const value = handle?.trim() || ''

    const local = validateHandleLocal(value, RESERVED.current)
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
          .neq('user_id', me.id)   // allow your own handle
          .maybeSingle()
        if (error) throw error
        if (data) {
          setHandleOk(false)
          setHandleMsg('That handle is already taken.')
        } else {
          setHandleOk(true)
          setHandleMsg('Handle is available ✓')
        }
      } catch (e) {
        setHandleOk(null)
        setHandleMsg('Could not verify handle right now.')
      } finally {
        setCheckingHandle(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [handle, authed, me?.id])

  // Save
  async function saveProfile(e) {
    e?.preventDefault?.()
    if (!authed) return
    setSaving(true); setErr(''); setOk('')

    try {
      // birthdate validation (if provided)
      if (!validateBirthdate(birthdate)) throw new Error(birthErr || 'Invalid birthdate.')

      // handle rules if going public
      if (publicProfile) {
        const local = validateHandleLocal(handle.trim(), RESERVED.current)
        if (!local.ok) throw new Error(local.msg)
        const { data: dupe } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('handle', handle.trim())
          .neq('user_id', me.id)
          .maybeSingle()
        if (dupe) throw new Error('That handle is already taken.')
      }

      // interests: split comma-separated → text[]
      const interestsArr = interestsStr
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
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
        pronouns: pronouns || null,
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
    setToasts((t)=>[...t,{id,msg}])
    setTimeout(()=>setToasts((t)=>t.filter(x=>x.id!==id)), 2000)
  }
  function copyText(text, label) {
    navigator.clipboard.writeText(text)
    showToast(`${label} copied!`)
  }

  if (!authed) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1>Profile</h1>
        <p>Please <a href="/auth">sign in</a> to edit your profile.</p>
      </div>
    )
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = handle ? `${origin}/u/${handle}` : ''
  const inviteUrl = `${origin}/auth?invite=${encodeURIComponent(me.id)}`

  return (
    <div className="container" style={{ padding: 24, maxWidth: 860 }}>
      <h1>Profile</h1>

      {!publicProfile && (
        <div className="card" style={{
          padding: 12, marginBottom: 12, background: '#fff8e1',
          border: '1px solid #f6ce52', borderLeft: '4px solid #f59e0b', color: '#5b4b1e'
        }}>
          Your profile is <strong>private</strong>. Others can’t view it unless you make it public.
        </div>
      )}

      {needsOnboarding && (
        <div className="card" style={{ padding:12, borderLeft:'4px solid var(--secondary)', marginBottom:12, background:'#fffaf7' }}>
          <strong>Finish your setup:</strong> add a display name and handle, and an optional photo.
        </div>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <form onSubmit={saveProfile} className="card" style={{ padding: 16, display:'grid', gap: 18 }}>
            {err && <div style={{ color:'#b91c1c' }}>{err}</div>}
            {ok && <div style={{ color:'#166534' }}>{ok}</div>}

            {/* Avatar */}
            <section>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Photo</div>
              <AvatarUploader userId={me.id} value={avatarUrl} onChange={setAvatarUrl} />
            </section>

            {/* Display name */}
            <label>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Display name</div>
              <input
                value={displayName}
                onChange={(e)=>setDisplayName(e.target.value)}
                placeholder="Your name"
                style={input}
              />
            </label>

            {/* Handle with validation + copy */}
            <label>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Handle</div>
              <input
                value={handle}
                onChange={(e)=>setHandle(normalizeHandle(e.target.value))}
                placeholder="your-handle"
                style={{
                  ...input,
                  borderColor: handleOk === false ? '#b91c1c'
                    : handleOk === true ? '#16a34a'
                    : 'var(--border)'
                }}
              />
              <div style={{ fontSize:12, marginTop:4,
                color: handleOk === false ? '#b91c1c'
                  : handleOk === true ? '#166534'
                  : 'var(--muted)' }}>
                {publicProfile
                  ? (handleMsg || 'Public URL: ' + (handle ? `/u/${handle}` : '/u/your-handle'))
                  : (handleMsg || 'Handle is optional until you go public.')
                }
              </div>
              {publicProfile && handleOk && handle && (
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop:6 }}
                  onClick={() => copyText(publicUrl,'Public URL')}
                >
                  Copy Public URL
                </button>
              )}
            </label>

            {/* Bio */}
            <label>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Bio</div>
              <textarea
                value={bio}
                onChange={(e)=>setBio(e.target.value)}
                placeholder="A short intro…"
                rows={4}
                maxLength={300}
                style={{ ...input, resize:'vertical' }}
              />
              <div className="muted" style={{ fontSize:12, marginTop:4 }}>
                {bio.length}/300 characters
              </div>
            </label>

            {/* Location */}
            <label>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Location</div>
              <input
                value={location}
                onChange={(e)=>setLocation(e.target.value)}
                placeholder="City, State (or City, Country)"
                style={input}
              />
            </label>

            {/* Birthdate */}
            <label>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Birthdate</div>
              <input
                type="date"
                value={birthdate || ''}
                onChange={(e)=>{ setBirthdate(e.target.value); setBirthErr('') }}
                onBlur={(e)=>validateBirthdate(e.target.value)}
                style={input}
              />
              <div style={{ fontSize:12, marginTop:4, color: birthErr ? '#b91c1c' : 'var(--muted)' }}>
                {birthErr || (age ? `Age: ${age}` : 'We use this only to show your age.')}
              </div>
            </label>

            {/* Pronouns */}
            <label>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Pronouns</div>
              <input
                value={pronouns}
                onChange={(e)=>setPronouns(e.target.value)}
                placeholder="e.g., she/her, he/him, they/them"
                style={input}
              />
            </label>

            {/* Interests */}
            <label>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Interests</div>
              <input
                value={interestsStr}
                onChange={(e)=>setInterestsStr(e.target.value)}
                placeholder="hiking, live music, sushi, travel"
                style={input}
              />
              <div className="muted" style={{ fontSize:12, marginTop:4 }}>
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
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving || (publicProfile && (handleOk === false || checkingHandle))}
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
              {publicProfile && handle && (
                <a href={`/u/${handle}`} className="btn">View public profile</a>
              )}
            </div>

            {/* Invite QR + Copy buttons */}
            <section className="card" style={{ padding:12, marginTop: 4 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center' }}>
                <div>
                  <div style={{ fontWeight:800, marginBottom:4 }}>Your invite QR</div>
                  <div className="muted" style={{ fontSize:12 }}>
                    Share in person. Scanning sends people to: <code>/auth?invite=…</code>
                  </div>
                  <div style={{ marginTop:8, display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => copyText(inviteUrl,'Invite link')}
                    >
                      Copy Invite Link
                    </button>
                    {publicProfile && handleOk && handle && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => copyText(publicUrl,'Public URL')}
                      >
                        Copy Public URL
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ background:'#fff', padding:8, borderRadius:12, border:'1px solid var(--border)' }}>
                  <QRCode value={inviteUrl} size={120} />
                </div>
              </div>
            </section>
          </form>

          {/* ===== Public Preview (brand-colored interest tags) ===== */}
          <div className="card" style={{ padding:16, marginTop:16 }}>
            <div style={{ textAlign:'center', marginBottom: 16 }}>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName || handle}
                  style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border:'2px solid var(--border)' }}
                />
              ) : (
                <div style={{
                  width:100,height:100,borderRadius:'50%',background:'#ddd',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  margin:'0 auto',fontSize:32,fontWeight:700
                }}>
                  {(displayName?.[0] || handle?.[0] || '?').toUpperCase()}
                </div>
              )}
              <h2 style={{ marginTop: 10 }}>{displayName || handle || 'Your Name'}</h2>
              {handle && <div className="muted">@{handle}</div>}
            </div>

            <div style={{ textAlign:'center', marginBottom: 12, color:'var(--text)' }}>
              {pronouns && <span style={{ marginRight: 8 }}>{pronouns}</span>}
              {location && <span style={{ marginRight: 8 }}>📍 {location}</span>}
              {age && <span>🎂 {age}</span>}
            </div>

            {bio && (
              <div style={{ marginBottom: 12, textAlign:'center', whiteSpace:'pre-line' }}>
                {bio}
              </div>
            )}

            {interestsArray.length > 0 && (
              <>
                <h3 style={{ marginTop: 8, marginBottom: 8, textAlign:'left' }}>Interests</h3>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {interestsArray.map((tag, i) => {
                    const isEven = i % 2 === 0
                    return (
                      <span
                        key={`${tag}-${i}`}
                        style={{
                          background: isEven ? '#008080' : '#FF6F61', // teal / coral
                          color: '#fff',
                          borderRadius: 20,
                          padding: '6px 14px',
                          fontSize: 14,
                          fontWeight: 500
                        }}
                      >
                        {tag}
                      </span>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Toast container */}
      <div style={{position:'fixed',top:16,right:16,display:'flex',flexDirection:'column',gap:8,zIndex:9999}}>
        {toasts.map(t=><Toast key={t.id} msg={t.msg} />)}
      </div>
    </div>
  )
}

function Toast({msg}) {
  return (
    <div style={{
      background:'#333', color:'#fff', padding:'8px 14px',
      borderRadius:8, fontSize:14, boxShadow:'0 2px 6px rgba(0,0,0,0.25)'
    }}>
      {msg}
    </div>
  )
}

const input = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: '#fff'
}














