// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import ProfilePhotosManager from '../components/ProfilePhotosManager'

const PROFILE_SELECT =
  'user_id, handle, display_name, bio, is_public, avatar_url'

// Safely grab the first row from Supabase .select() results
function firstRow(data) {
  if (!data) return null
  return Array.isArray(data) ? (data[0] || null) : data
}

function sanitizeHandle(s) {
  const base = (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 24)
    .replace(/^_+|_+$/g, '')
  return base || 'user'
}

async function fetchProfileByUserId(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', userId)
    .limit(1)

  if (error) throw error
  return firstRow(data)
}

async function createProfileForUser(me) {
  const emailBase = sanitizeHandle(
    (me?.email || me?.user_metadata?.email || '').split('@')[0] ||
      me?.id?.slice(0, 6) ||
      'user'
  )

  let attempt = 0
  while (true) {
    const candidate = attempt === 0 ? emailBase : `${emailBase}${attempt}`

    const toInsert = {
      user_id: me.id,
      handle: candidate,
      display_name: me.user_metadata?.full_name || candidate,
      is_public: true,
      bio: '',
      avatar_url: null
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert(toInsert)
      .select(PROFILE_SELECT)

    if (!error) return firstRow(data)

    // 23505 = unique violation (handle conflict, etc.)
    if (error?.code === '23505') {
      attempt += 1
      if (attempt > 30) throw new Error('Could not generate a unique handle.')
      continue
    }

    throw error
  }
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const [me, setMe] = useState(null)
  const [uploading, setUploading] = useState(false)

  const [profile, setProfile] = useState({
    user_id: '',
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
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (mounted) setMe(user || null)
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Ensure we have a profile row (self-healing)
  const ensureProfile = useCallback(async () => {
    if (!me?.id) return null
    setLoading(true)
    setErr('')
    setMsg('')

    try {
      const existing = await fetchProfileByUserId(me.id)
      if (existing) {
        setProfile(existing)
        return existing
      }

      const created = await createProfileForUser(me)
      if (created) setProfile(created)
      return created
    } catch (e) {
      setErr(e?.message || 'Failed to load profile')
      return null
    } finally {
      setLoading(false)
    }
  }, [me?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (me?.id) ensureProfile()
  }, [me?.id, ensureProfile])

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
      // Ensure row exists (fixes "0 rows" edge cases)
      const row = await ensureProfile()
      if (!row?.user_id) throw new Error('Profile record missing.')

      const payload = {
        handle: profile.handle.trim(),
        display_name: (profile.display_name || '').trim(),
        bio: profile.bio || '',
        is_public: !!profile.is_public,
        avatar_url: profile.avatar_url || null
      }

      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('user_id', me.id)
        .select(PROFILE_SELECT)

      if (error) throw error

      const updated = firstRow(data)
      if (updated) setProfile(updated)
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

      // Ensure row exists first
      const row = await ensureProfile()
      if (!row?.user_id) throw new Error('Profile record missing.')

      // Basic iPhone HEIC guard (optional but helpful)
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      if (ext === 'heic' || ext === 'heif' || (file.type || '').includes('heic')) {
        throw new Error(
          'This photo format (HEIC) isn’t supported yet. Please choose a different photo or set iPhone Camera Formats to “Most Compatible”.'
        )
      }

      const safeExt = ext || 'jpg'
      const path = `${me.id}/${Date.now()}.${safeExt}`

      // Upload to storage bucket "avatars"
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, {
          upsert: true,
          contentType: file.type || 'application/octet-stream'
        })
      if (upErr) throw upErr

      const { data: pub } = await supabase.storage.from('avatars').getPublicUrl(path)
      const url = pub?.publicUrl || ''
      if (!url) throw new Error('Could not generate public URL for avatar.')

      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('user_id', me.id)
        .select(PROFILE_SELECT)

      if (error) throw error

      const updated = firstRow(data)
      if (updated) setProfile(updated)
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

      // Ensure row exists first
      const row = await ensureProfile()
      if (!row?.user_id) throw new Error('Profile record missing.')

      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('user_id', me.id)
        .select(PROFILE_SELECT)

      if (error) throw error

      const updated = firstRow(data)
      if (updated) setProfile(updated)
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

      {err && (
        <div className="helper-error" style={{ marginBottom: 12 }}>
          {err}
        </div>
      )}
      {msg && (
        <div className="helper-success" style={{ marginBottom: 12 }}>
          {msg}
        </div>
      )}

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
              value={profile.handle || ''}
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
              value={profile.display_name || ''}
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


























