// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import ProfilePhotosManager from '../components/ProfilePhotosManager'

function sanitizeHandle(s) {
  const base = (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 24)
    .replace(/^_+|_+$/g, '')
  return base || 'user'
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
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (mounted) setMe(user || null)
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Ensure we have a profile row
  useEffect(() => {
    if (!me?.id) return
    let mounted = true

    async function ensureProfile() {
      setLoading(true)
      setErr('')
      setMsg('')
      try {
        // 1) Try to fetch existing (limit(1) prevents "single JSON object" crashes)
        const { data: existing, error: selErr } = await supabase
          .from('profiles')
          .select('handle, display_name, bio, is_public, avatar_url')
          .eq('user_id', me.id)
          .limit(1)
          .maybeSingle()

        if (selErr) throw selErr

        if (existing) {
          if (mounted) setProfile(existing)
          return
        }

        // 2) Auto-provision if missing
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
            avatar_url: ''
          }

          // IMPORTANT: do NOT use .single() here (it crashes if backend returns array)
          const { data: createdArr, error: insErr } = await supabase
            .from('profiles')
            .insert(toInsert)
            .select('handle, display_name, bio, is_public, avatar_url')

          if (!insErr) {
            const created = Array.isArray(createdArr) ? createdArr[0] : createdArr
            if (created && mounted) setProfile(created)
            break
          }

          // Unique violation: could be handle or (after we add it) user_id unique
          if (insErr?.code === '23505') {
            // If user_id is already there (race condition), just fetch and use it
            const msgText = String(insErr?.message || insErr?.details || '')
            if (msgText.includes('profiles_user_id_key')) {
              const { data: existing2, error: selErr2 } = await supabase
                .from('profiles')
                .select('handle, display_name, bio, is_public, avatar_url')
                .eq('user_id', me.id)
                .limit(1)
                .maybeSingle()
              if (selErr2) throw selErr2
              if (existing2 && mounted) setProfile(existing2)
              break
            }

            // Otherwise assume handle conflict and try another
            attempt += 1
            if (attempt > 30) throw new Error('Could not generate a unique handle.')
            continue
          }

          throw insErr
        }
      } catch (e) {
        if (mounted) setErr(e.message || 'Failed to load profile')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    ensureProfile()
    return () => {
      mounted = false
    }
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
      const payload = {
        handle: profile.handle.trim(),
        display_name: (profile.display_name || '').trim(),
        bio: profile.bio || '',
        is_public: !!profile.is_public,
        avatar_url: profile.avatar_url || null
      }

      // DON'T use .single() (can crash if duplicates exist)
      const { data: rows, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('user_id', me.id)
        .select('handle, display_name, bio, is_public, avatar_url')

      if (error) throw error

      const row = Array.isArray(rows) ? rows[0] : rows
      if (!row) throw new Error('No profile row found to update.')
      setProfile(row)
      setMsg('Saved!')
    } catch (e) {
      setErr(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadAvatar(ev) {
    try {
      const file = ev?.target?.files?.[0]
      if (!file || !me?.id) return
      setUploading(true)
      setErr('')
      setMsg('')

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${me.id}/${Date.now()}.${ext}`

      // ensure bucket "avatars" exists in your project
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg'
      })
      if (upErr) throw upErr

      const { data: pub } = await supabase.storage.from('avatars').getPublicUrl(path)
      const url = pub?.publicUrl || ''

      // DON'T use .single() here
      const { data: rows, error } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('user_id', me.id)
        .select('handle, display_name, bio, is_public, avatar_url')

      if (error) throw error

      const row = Array.isArray(rows) ? rows[0] : rows
      if (!row) throw new Error('No profile row found to update avatar.')
      setProfile(row)
      setMsg('Photo updated!')
    } catch (e) {
      setErr(e.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (ev?.target) ev.target.value = ''
    }
  }

  async function handleRemoveAvatar() {
    try {
      if (!me?.id) return
      setUploading(true)
      setErr('')
      setMsg('')

      // DON'T use .single() here
      const { data: rows, error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('user_id', me.id)
        .select('handle, display_name, bio, is_public, avatar_url')

      if (error) throw error

      const row = Array.isArray(rows) ? rows[0] : rows
      if (!row) throw new Error('No profile row found to remove avatar.')
      setProfile(row)
      setMsg('Photo removed.')
    } catch (e) {
      setErr(e.message || 'Failed to remove photo')
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

      {/* ✅ Multi-photo manager lives on the profile page */}
      <div style={{ marginTop: 26 }}>
        <ProfilePhotosManager userId={me.id} />
      </div>
    </div>
  )
}




























