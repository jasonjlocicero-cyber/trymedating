// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import ProfilePhotosManager from '../components/ProfilePhotosManager'

const PROFILE_SELECT = 'user_id, handle, display_name, bio, is_public, avatar_url'

function sanitizeHandle(s) {
  const base = (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 24)
    .replace(/^_+|_+$/g, '')
  return base || 'user'
}

// Hard rule: never rely on `.single()`.
// Always ensure a row exists, then re-fetch with maybeSingle().
async function ensureProfileRow(me) {
  if (!me?.id) return null

  // 1) Try fetch
  const { data: existing, error: selErr } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', me.id)
    .maybeSingle()

  if (selErr) throw selErr
  if (existing) return existing

  // 2) If missing, create one (handle must be unique)
  const emailBase = sanitizeHandle(me.email?.split('@')[0] || me.id.slice(0, 6))

  for (let attempt = 0; attempt <= 30; attempt += 1) {
    const candidate = attempt === 0 ? emailBase : `${emailBase}${attempt}`
    const toInsert = {
      user_id: me.id,
      handle: candidate,
      display_name: me.user_metadata?.full_name || candidate,
      is_public: true,
      bio: '',
      avatar_url: null
    }

    const { error: insErr } = await supabase.from('profiles').insert(toInsert)

    if (!insErr) {
      // Re-fetch safely
      const { data: created, error: refErr } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('user_id', me.id)
        .maybeSingle()

      if (refErr) throw refErr
      if (created) return created

      // Extremely rare: insert ok but read blocked by RLS/replication delay
      // Try one more fetch:
      const { data: created2 } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('user_id', me.id)
        .maybeSingle()

      return created2 || null
    }

    // Handle collisions
    if (insErr?.code === '23505') continue

    throw insErr
  }

  throw new Error('Could not generate a unique handle.')
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const [me, setMe] = useState(null)
  const [uploading, setUploading] = useState(false)

  const [profile, setProfile] = useState({
    handle: '',
    display_name: '',
    bio: '',
    is_public: true,
    avatar_url: ''
  })

  // Load auth user
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (mounted) setMe(user || null)
    })()
    return () => { mounted = false }
  }, [])

  // Ensure profile row exists + load it
  useEffect(() => {
    if (!me?.id) return
    let mounted = true

    ;(async () => {
      setLoading(true)
      setErr('')
      setMsg('')

      try {
        const row = await ensureProfileRow(me)
        if (!mounted) return
        if (row) {
          setProfile({
            handle: row.handle || '',
            display_name: row.display_name || '',
            bio: row.bio || '',
            is_public: !!row.is_public,
            avatar_url: row.avatar_url || ''
          })
        }
      } catch (e) {
        if (mounted) setErr(e?.message || 'Failed to load profile')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => { mounted = false }
  }, [me?.id])

  const canSave = useMemo(
    () => !!me?.id && !!profile.handle?.trim() && !saving,
    [me?.id, profile.handle, saving]
  )

  async function saveProfile(e) {
    e?.preventDefault?.()
    if (!canSave) return

    setSaving(true)
    setErr('')
    setMsg('')

    try {
      // Guarantee row exists before update
      await ensureProfileRow(me)

      const payload = {
        handle: profile.handle.trim(),
        display_name: (profile.display_name || '').trim(),
        bio: profile.bio || '',
        is_public: !!profile.is_public,
        avatar_url: profile.avatar_url || null
      }

      const { error: upErr } = await supabase
        .from('profiles')
        .update(payload)
        .eq('user_id', me.id)

      if (upErr) throw upErr

      // Re-fetch safely
      const { data: fresh, error: refErr } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('user_id', me.id)
        .maybeSingle()

      if (refErr) throw refErr
      if (fresh) {
        setProfile({
          handle: fresh.handle || '',
          display_name: fresh.display_name || '',
          bio: fresh.bio || '',
          is_public: !!fresh.is_public,
          avatar_url: fresh.avatar_url || ''
        })
      }

      setMsg('Saved!')
    } catch (e2) {
      setErr(e2?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadAvatar(ev) {
    try {
      const file = ev.target.files?.[0]
      if (!file || !me?.id) return

      setUploading(true)
      setErr('')
      setMsg('')

      // Guarantee row exists BEFORE upload/update
      await ensureProfileRow(me)

      const extFromName = file.name?.includes('.') ? file.name.split('.').pop()?.toLowerCase() : ''
      const ext =
        extFromName ||
        (file.type === 'image/png' ? 'png' : '') ||
        (file.type === 'image/webp' ? 'webp' : '') ||
        (file.type === 'image/heic' ? 'heic' : '') ||
        'jpg'

      const path = `${me.id}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg'
      })
      if (upErr) throw upErr

      const { data: pub } = await supabase.storage.from('avatars').getPublicUrl(path)
      const url = pub?.publicUrl || ''
      if (!url) throw new Error('Upload succeeded, but could not get avatar URL.')

      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('user_id', me.id)

      if (dbErr) throw dbErr

      // Re-fetch
      const { data: fresh, error: refErr } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('user_id', me.id)
        .maybeSingle()

      if (refErr) throw refErr
      if (fresh) {
        setProfile({
          handle: fresh.handle || '',
          display_name: fresh.display_name || '',
          bio: fresh.bio || '',
          is_public: !!fresh.is_public,
          avatar_url: fresh.avatar_url || ''
        })
      }

      setMsg('Photo updated!')
    } catch (e) {
      setErr(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
      ev.target.value = ''
    }
  }

  async function handleRemoveAvatar() {
    try {
      if (!me?.id) return

      setUploading(true)
      setErr('')
      setMsg('')

      await ensureProfileRow(me)

      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('user_id', me.id)

      if (dbErr) throw dbErr

      const { data: fresh, error: refErr } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('user_id', me.id)
        .maybeSingle()

      if (refErr) throw refErr
      if (fresh) {
        setProfile({
          handle: fresh.handle || '',
          display_name: fresh.display_name || '',
          bio: fresh.bio || '',
          is_public: !!fresh.is_public,
          avatar_url: fresh.avatar_url || ''
        })
      }

      setMsg('Photo removed.')
    } catch (e) {
      setErr(e?.message || 'Failed to remove photo')
    } finally {
      setUploading(false)
    }
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
    <div className="container" style={{ padding: '28px 0', maxWidth: 920 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Keep it simple. Your handle is public; toggle visibility anytime.
      </p>

      {err && <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '180px 1fr',
          gap: 18,
          alignItems: 'start'
        }}
      >
        {/* Avatar column */}
        <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
          <div className="avatar-frame" style={{ width: 140, height: 140 }}>
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            ) : (
              <div className="avatar-initials">
                {(profile.display_name || profile.handle || 'U').slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <label className="btn btn-primary btn-pill" style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
              {uploading ? 'Uploading…' : 'Upload photo'}
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadAvatar}
                style={{ display: 'none' }}
                disabled={uploading}
              />
            </label>

            {profile.avatar_url && (
              <button
                type="button"
                className="btn btn-neutral btn-pill"
                onClick={handleRemoveAvatar}
                disabled={uploading}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Right-side form */}
        <form onSubmit={saveProfile} style={{ display: 'grid', gap: 12 }}>
          <label className="form-label">
            Handle
            <input
              className="input"
              value={profile.handle}
              onChange={(e) => setProfile((p) => ({ ...p, handle: e.target.value.toLowerCase() }))}
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
              onChange={(e) => setProfile((p) => ({ ...p, display_name: e.target.value }))}
              placeholder="Your name"
            />
          </label>

          <label className="form-label">
            Bio
            <textarea
              className="input"
              rows={4}
              value={profile.bio || ''}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              placeholder="A short intro…"
            />
          </label>

          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={!!profile.is_public}
              onChange={(e) => setProfile((p) => ({ ...p, is_public: e.target.checked }))}
            />
            Public profile
          </label>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-pill" type="submit" disabled={!canSave}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>

      {/* Multi-photo manager */}
      <div style={{ marginTop: 26 }}>
        <ProfilePhotosManager userId={me.id} />
      </div>
    </div>
  )
}





























