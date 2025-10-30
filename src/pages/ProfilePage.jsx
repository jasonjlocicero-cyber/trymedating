// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

function sanitizeHandle(s) {
  const base = (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 24)
    .replace(/^_+|_+$/g, '')
  return base || 'user'
}

const AVATAR_SIZE = 180        // bigger photo like before
const WIDE_BREAKPOINT = 720    // switch to 2 cols at this width

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState({
    handle: '',
    display_name: '',
    bio: '',
    is_public: true,
    avatar_url: '',
    is_verified: false,
  })

  // Verification state
  const [vreq, setVreq] = useState(null)
  const [vBusy, setVBusy] = useState(false)
  const [vMsg, setVMsg] = useState('')

  // Track viewport to keep layout responsive without changing global CSS
  const [wide, setWide] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= WIDE_BREAKPOINT : true
  )
  useEffect(() => {
    function onResize() {
      setWide(window.innerWidth >= WIDE_BREAKPOINT)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Load auth user
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (mounted) setMe(user || null)
    })()
    return () => { mounted = false }
  }, [])

  // Ensure profile exists
  useEffect(() => {
    if (!me?.id) return
    let mounted = true

    async function ensureProfile() {
      setLoading(true); setErr(''); setMsg('')
      try {
        const { data: existing, error: selErr } = await supabase
          .from('profiles')
          .select('handle, display_name, bio, is_public, avatar_url, is_verified')
          .eq('user_id', me.id)
          .maybeSingle()
        if (selErr) throw selErr

        if (existing) {
          if (mounted) setProfile(existing)
        } else {
          const emailBase = sanitizeHandle(me.email?.split('@')[0] || me.id.slice(0, 6))
          let attempt = 0
          while (true) {
            const candidate = attempt === 0 ? emailBase : `${emailBase}${attempt}`
            const toInsert = {
              user_id: me.id,
              handle: candidate,
              display_name: me.user_metadata?.full_name || candidate,
              is_public: true,
              bio: '',
              avatar_url: null,
              is_verified: false,
            }
            const { data: created, error: insErr } = await supabase
              .from('profiles')
              .insert(toInsert)
              .select('handle, display_name, bio, is_public, avatar_url, is_verified')
              .single()
            if (!insErr) {
              if (mounted) setProfile(created)
              break
            }
            if (insErr?.code === '23505') {
              attempt += 1
              if (attempt > 30) throw new Error('Could not generate a unique handle.')
            } else {
              throw insErr
            }
          }
        }

        // Latest verification request
        const { data: req } = await supabase
          .from('verification_requests')
          .select('*')
          .eq('user_id', me.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (mounted) setVreq(req || null)

      } catch (e) {
        if (mounted) setErr(e.message || 'Failed to load profile')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    ensureProfile()
    return () => { mounted = false }
  }, [me?.id])

  const canSave = useMemo(
    () => !!me?.id && !!profile.handle?.trim() && !saving,
    [me?.id, profile, saving]
  )

  async function saveProfile(e) {
    e?.preventDefault?.()
    if (!canSave) return
    setSaving(true); setErr(''); setMsg('')
    try {
      const payload = {
        handle: profile.handle.trim(),
        display_name: (profile.display_name || '').trim(),
        bio: profile.bio || '',
        is_public: !!profile.is_public,
      }
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('user_id', me.id)
        .select('handle, display_name, bio, is_public, avatar_url, is_verified')
        .single()
      if (error) throw error
      setProfile(data)
      setMsg('Saved!')
    } catch (e) {
      setErr(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Avatar upload/remove
  async function handleAvatarChange(evt) {
    const file = evt.target.files?.[0]
    if (!file || !me?.id) return
    setMsg(''); setErr('')
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `avatars/${me.id}-${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        cacheControl: '3600',
        upsert: false
      })
      if (upErr) throw upErr

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const nextUrl = pub?.publicUrl || ''

      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: nextUrl })
        .eq('user_id', me.id)
        .select('handle, display_name, bio, is_public, avatar_url, is_verified')
        .single()
      if (error) throw error
      setProfile(data)
      setMsg('Photo updated.')
    } catch (e) {
      setErr(e.message || 'Failed to upload photo')
    }
  }

  async function removeAvatar() {
    if (!me?.id) return
    setMsg(''); setErr('')
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('user_id', me.id)
        .select('handle, display_name, bio, is_public, avatar_url, is_verified')
        .single()
      if (error) throw error
      setProfile(data)
      setMsg('Photo removed.')
    } catch (e) {
      setErr(e.message || 'Failed to remove photo')
    }
  }

  // Verification actions
  async function requestVerification() {
    if (!me?.id) return
    setVBusy(true); setVMsg('')
    const { error } = await supabase
      .from('verification_requests')
      .insert({ user_id: me.id, status: 'pending' })
    setVBusy(false)
    if (error && error.code !== '23505') {
      setVMsg(error.message || 'Could not create request')
    } else {
      setVMsg('Verification request sent.')
      const { data } = await supabase
        .from('verification_requests')
        .select('*')
        .eq('user_id', me.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setVreq(data || null)
    }
  }

  async function cancelVerification() {
    if (!vreq?.id || vreq?.status !== 'pending') return
    setVBusy(true); setVMsg('')
    const { error } = await supabase
      .from('verification_requests')
      .delete()
      .eq('id', vreq.id)
    setVBusy(false)
    if (error) setVMsg(error.message || 'Failed to cancel')
    else { setVreq(null); setVMsg('Request canceled.') }
  }

  if (!me) {
    return (
      <div className="container" style={{ padding: '28px 0' }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
        <div className="muted">Please sign in to view your profile.</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: '28px 0' }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
        <div className="muted">Loading…</div>
      </div>
    )
  }

  return (
    <div className="container" style={{ padding: '28px 0', maxWidth: 1100 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Your public handle and basic details. Others can see your profile if you set it to public.
      </p>

      {err && <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Two-column layout on wide screens, single-column on mobile */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: wide ? '300px 1fr' : '1fr',
          gap: 24,
          alignItems: 'start'
        }}
      >
        {/* Left: Avatar */}
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="section-title">Profile photo</div>
          <div
            className="avatar-frame"
            style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div className="avatar-initials" style={{ fontSize: 44 }}>
                {(profile.display_name || profile.handle || 'U').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="actions-row">
            <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
              Upload photo
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: 'none' }}
              />
            </label>
            {profile.avatar_url && (
              <button type="button" className="btn btn-neutral" onClick={removeAvatar}>
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Right: Fields */}
        <form onSubmit={saveProfile} style={{ display: 'grid', gap: 12 }}>
          <label className="form-label">
            Handle
            <input
              className="input"
              value={profile.handle}
              onChange={(e) => setProfile(p => ({ ...p, handle: e.target.value.toLowerCase() }))}
              placeholder="yourname"
              required
            />
            <div className="helper-muted" style={{ fontSize: 12 }}>
              Your public URL will be <code>/u/{profile.handle || '…'}</code>
            </div>
          </label>

          <label className="form-label">
            Display name
            <input
              className="input"
              value={profile.display_name}
              onChange={(e) => setProfile(p => ({ ...p, display_name: e.target.value }))}
              placeholder="Your name"
            />
          </label>

          <label className="form-label">
            Bio
            <textarea
              className="input"
              rows={4}
              value={profile.bio || ''}
              onChange={(e) => setProfile(p => ({ ...p, bio: e.target.value }))}
              placeholder="A short intro…"
            />
          </label>

          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={!!profile.is_public}
              onChange={(e) => setProfile(p => ({ ...p, is_public: e.target.checked }))}
            />
            Public profile
          </label>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="submit" disabled={!canSave}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>

            {profile.is_verified && (
              <span
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: 'var(--brand-teal)',
                  color: '#fff',
                  fontWeight: 800
                }}
              >
                Verified ✓
              </span>
            )}
          </div>

          {/* Verification box */}
          <div
            style={{
              marginTop: 6,
              padding: 16,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong>Verification</strong>
              {profile.is_verified && (
                <span style={{
                  marginLeft: 6, padding: '2px 8px', borderRadius: 999,
                  background: 'var(--brand-teal)', color: '#fff', fontSize: 12, fontWeight: 800
                }}>Verified ✓</span>
              )}
            </div>

            {!profile.is_verified && (
              <>
                {vreq?.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="muted">Request is pending review.</span>
                    <button className="btn btn-neutral" type="button" onClick={cancelVerification} disabled={vBusy}>
                      {vBusy ? 'Canceling…' : 'Cancel request'}
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-primary" type="button" onClick={requestVerification} disabled={vBusy}>
                    {vBusy ? 'Sending…' : 'Request verification'}
                  </button>
                )}
              </>
            )}

            {vMsg && <div className="helper-muted" style={{ marginTop: 8 }}>{vMsg}</div>}
          </div>
        </form>
      </div>
    </div>
  )
}

























