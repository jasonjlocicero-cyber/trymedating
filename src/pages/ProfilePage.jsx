import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const MAX_AVATAR_MB = 4
const ACCEPT_AVATAR = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

export default function ProfilePage() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [age, setAge] = useState('')
  const [location, setLocation] = useState('')
  const [interests, setInterests] = useState('') // comma-separated

  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')

  // Invite QR (private on Profile only)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')

  const fileRef = useRef(null)

  // Load auth user
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) {
        navigate('/auth?next=' + encodeURIComponent('/profile'))
        return
      }
      setMe(user)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) navigate('/auth?next=' + encodeURIComponent('/profile'))
      setMe(session?.user || null)
    })
    return () => sub.subscription.unsubscribe()
  }, [navigate])

  // Load existing profile
  useEffect(() => {
    if (!me?.id) return
    ;(async () => {
      setLoading(true); setError(''); setNotice('')
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_url, bio, age, location, interests')
        .eq('user_id', me.id)
        .maybeSingle()
      if (error) setError(error.message)
      if (data) {
        setDisplayName(data.display_name || '')
        setHandle(data.handle || '')
        setBio(data.bio || '')
        setAge(data.age?.toString?.() || '')
        setLocation(data.location || '')
        setInterests(Array.isArray(data.interests) ? data.interests.join(', ') : (data.interests || ''))
        setAvatarUrl(data.avatar_url || '')
      }
      setLoading(false)
    })()
  }, [me?.id])

  // Avatar preview cleanup
  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }
  }, [avatarPreview])

  // Load or create an active invite code (private)
  useEffect(() => {
    if (!me?.id) return
    ;(async () => {
      try {
        setInviteLoading(true); setInviteError('')
        // Try to reuse an active code
        const { data: existing, error: selErr } = await supabase
          .from('invite_codes')
          .select('code')
          .eq('owner', me.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()
        if (selErr) throw selErr
        if (existing?.code) {
          setInviteCode(existing.code)
        } else {
          // Create a new code
          const { data: created, error: insErr } = await supabase
            .from('invite_codes')
            .insert({ owner: me.id })
            .select('code')
            .single()
          if (insErr) throw insErr
          setInviteCode(created?.code || '')
        }
      } catch (e) {
        setInviteError(e.message || 'Could not prepare invite')
      } finally {
        setInviteLoading(false)
      }
    })()
  }, [me?.id])

  const canSave = useMemo(() => {
    if (!handle.trim()) return false
    if (saving) return false
    return true
  }, [handle, saving])

  async function uploadAvatarIfAny() {
    if (!avatarFile || !me?.id) return avatarUrl || ''
    const clean = avatarFile.name.replace(/[^\w.\-]+/g, '_')
    const path = `user_${me.id}/${Date.now()}_${clean}`
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, avatarFile, { cacheControl: '3600', upsert: false, contentType: avatarFile.type })
    if (upErr) throw upErr
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    if (!data?.publicUrl) throw new Error('Could not get avatar public URL')
    return data.publicUrl
  }

  async function onSave(e) {
    e?.preventDefault?.()
    if (!me?.id) return
    setSaving(true); setError(''); setNotice('')
    try {
      const newAvatarUrl = await uploadAvatarIfAny()

      const cleanHandle = handle.trim().toLowerCase()
      const cleanDisplay = displayName.trim()
      const parsedAge = age ? parseInt(age, 10) : null
      const interestArray = interests
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const { error: upErr } = await supabase.from('profiles').upsert({
        user_id: me.id,
        handle: cleanHandle,
        display_name: cleanDisplay || cleanHandle,
        avatar_url: newAvatarUrl || null,
        bio: bio || null,
        age: parsedAge,
        location: location || null,
        interests: interestArray.length ? interestArray : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      if (upErr) throw upErr

      setAvatarUrl(newAvatarUrl || avatarUrl)
      setAvatarFile(null)
      if (avatarPreview) { URL.revokeObjectURL(avatarPreview); setAvatarPreview('') }

      setNotice('Profile saved ✔')
    } catch (err) {
      setError(err.message || 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  function pickFile() { fileRef.current?.click() }
  function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!ACCEPT_AVATAR.includes(f.type)) { setError('Unsupported image type'); return }
    if (f.size > MAX_AVATAR_MB * 1024 * 1024) { setError(`Avatar too large (max ${MAX_AVATAR_MB}MB)`); return }
    setAvatarFile(f)
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(URL.createObjectURL(f))
  }

  if (!me) return null

  // Private invite QR values
  const inviteLink = inviteCode ? `${window.location.origin}/connect?code=${inviteCode}` : ''
  const qrSrc = inviteLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(inviteLink)}`
    : ''

  return (
    <div className="container" style={{ padding: '32px 0' }}>
      <h1 style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--secondary)' }}>Edit</span>{' '}
        <span style={{ color: 'var(--primary)' }}>Profile</span>
      </h1>

      {loading && <div className="card">Loading your profile…</div>}
      {error && <div className="card" style={{ borderColor: '#e11d48', color: '#e11d48' }}>{error}</div>}
      {notice && <div className="card" style={{ borderColor: 'var(--secondary)', color: 'var(--secondary)' }}>{notice}</div>}

      {!loading && (
        <form className="card" onSubmit={onSave} style={{ display: 'grid', gap: 16 }}>
          {/* Avatar + quick preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <img
                src={avatarPreview || avatarUrl || 'https://via.placeholder.com/120?text=%F0%9F%91%A4'}
                alt="avatar"
                style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
              />
              <button
                type="button"
                className="btn"
                onClick={pickFile}
                style={{
                  position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
                  padding: '6px 10px', fontSize: 12
                }}
                title="Upload new avatar"
              >
                Change
              </button>
              <input ref={fileRef} type="file" accept={ACCEPT_AVATAR.join(',')} onChange={onFile} style={{ display: 'none' }} />
            </div>

            <div style={{ flex: 1, minWidth: 260 }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Display name</label>
              <input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="How others will see you" />

              <div className="mt-12" />
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Handle (public URL)</label>
              <input value={handle} onChange={e=>setHandle(e.target.value)} placeholder="yourhandle" />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                Your public profile will be at <code>/u/{(handle||'yourhandle').toLowerCase()}</code>
              </div>
            </div>
          </div>

          {/* About */}
          <div>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Bio</label>
            <textarea rows={4} value={bio} onChange={e=>setBio(e.target.value)} placeholder="Tell people a bit about you…" />
          </div>

          {/* Details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Age</label>
              <input type="number" min="18" max="110" value={age} onChange={e=>setAge(e.target.value)} placeholder="e.g., 29" />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Location</label>
              <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="City, Country" />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Interests</label>
              <input value={interests} onChange={e=>setInterests(e.target.value)} placeholder="e.g., hiking, sushi, live music" />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Comma-separated — we’ll store these as a list.</div>
            </div>
          </div>

          {/* Save */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={!canSave}>
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      )}

      {/* Public preview card */}
      {!loading && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <img
              src={avatarPreview || avatarUrl || 'https://via.placeholder.com/96?text=%F0%9F%91%A4'}
              alt=""
              style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
            />
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0 }}>{displayName || handle || 'Your Name'}</h2>
              <div className="badge">@{(handle || 'yourhandle').toLowerCase()}</div>
              <p style={{ marginTop: 8 }}>{bio || 'Your bio will appear here.'}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {age && <span className="badge">Age: {age}</span>}
                {location && <span className="badge">Location: {location}</span>}
                {interests && interests.split(',').map((t, i) => (
                  <span key={i} className="badge">{t.trim()}</span>
                ))}
              </div>
            </div>
            <div>
              <a className="btn" href={`/u/${(handle || 'yourhandle').toLowerCase()}`} target="_blank" rel="noreferrer">
                View public profile
              </a>
            </div>
          </div>
        </div>
      )}

      {/* PRIVATE: Invite via QR (only visible to you here) */}
      {!loading && (
        <div className="card" style={{ marginTop: 16, display:'grid', justifyItems:'center', gap: 12 }}>
          <div style={{ fontWeight: 800 }}>Invite someone to connect</div>
          {inviteLoading && <div>Preparing your invite…</div>}
          {inviteError && <div style={{ color:'#e11d48' }}>{inviteError}</div>}
          {!inviteLoading && !inviteError && inviteCode && (
            <>
              <img
                src={qrSrc}
                alt="Invite QR"
                width={220}
                height={220}
                style={{ borderRadius: 12, border: '1px solid var(--border)' }}
              />
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{inviteLink}</div>
              <div style={{ display:'flex', gap: 12 }}>
                <a className="btn" href={inviteLink} target="_blank" rel="noreferrer">Open link</a>
                <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(inviteLink)}>
                  Copy link
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}



