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

async function fetchMyProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

// Guarantee a row exists (never use .single()).
// IMPORTANT: default new users to PRIVATE so we don’t violate public_requires_avatar.
async function ensureProfileRow(me) {
  if (!me?.id) return null

  const existing = await fetchMyProfile(me.id)
  if (existing) return existing

  const emailBase = sanitizeHandle(me.email?.split('@')[0] || me.id.slice(0, 6))

  for (let attempt = 0; attempt <= 30; attempt += 1) {
    const candidate = attempt === 0 ? emailBase : `${emailBase}${attempt}`

    const toInsert = {
      user_id: me.id,
      handle: candidate,
      display_name: me.user_metadata?.full_name || candidate,
      is_public: false, // ✅ start private until avatar exists
      bio: '',
      avatar_url: null
    }

    const { error: insErr } = await supabase.from('profiles').insert(toInsert)
    if (!insErr) {
      const created = await fetchMyProfile(me.id)
      return created
    }

    // Unique conflict (handle/user_id/etc)
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
    is_public: false,
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

  // Ensure we have a profile row
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

  const canSave = useMemo(() => {
    if (!me?.id) return false
    if (!profile.handle?.trim()) return false
    if (saving) return false
    if (profile.is_public && !profile.avatar_url) return false
    return true
  }, [me?.id, profile.handle, profile.is_public, profile.avatar_url, saving])

  async function saveProfile(e) {
    e?.preventDefault?.()
    if (!me?.id) return

    setSaving(true)
    setErr('')
    setMsg('')

    try {
      await ensureProfileRow(me)

      const payload = {
        handle: profile.handle.trim(),
        display_name: (profile.display_name || '').trim(),
        bio: profile.bio || '',
        is_public: !!profile.is_public,
        avatar_url: profile.avatar_url || null
      }

      if (payload.is_public && !payload.avatar_url) {
        throw new Error('Upload a profile photo before making your profile public.')
      }

      const { error: upErr } = await supabase.from('profiles').update(payload).eq('user_id', me.id)
      if (upErr) throw upErr

      const fresh = await fetchMyProfile(me.id)
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

      const fresh = await fetchMyProfile(me.id)
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

      const updates = profile.is_public
        ? { avatar_url: null, is_public: false }
        : { avatar_url: null }

      const { error: dbErr } = await supabase.from('profiles').update(updates).eq('user_id', me.id)
      if (dbErr) throw dbErr

      const fresh = await fetchMyProfile(me.id)
      if (fresh) {
        setProfile({
          handle: fresh.handle || '',
          display_name: fresh.display_name || '',
          bio: fresh.bio || '',
          is_public: !!fresh.is_public,
          avatar_url: fresh.avatar_url || ''
        })
      }

      setMsg(profile.is_public ? 'Photo removed. Your profile is now private.' : 'Photo removed.')
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
      {/* Component-scoped layout CSS so this can't "revert" */}
      <style>{`
        .tmd-profile-grid{
          display:grid;
          grid-template-columns: 180px 1fr;
          gap: 18px;
          align-items:start;
        }
        .tmd-profile-avatar-col{
          display:grid;
          gap:10px;
          justify-items:center;
        }
        .tmd-profile-top{
          display:grid;
          gap:12px;
          min-width:0;
        }
        /* ✅ Bio spans BOTH columns (under photo + under display name) */
        .tmd-profile-bio{
          grid-column: 1 / -1;
          min-width:0;
        }
        /* ✅ Keep lower controls roomy too */
        .tmd-profile-lower{
          grid-column: 1 / -1;
          display:grid;
          gap:12px;
        }
        @media (max-width: 640px){
          .tmd-profile-grid{ grid-template-columns: 140px 1fr; }
          .tmd-profile-avatar-col{ justify-items:start; }
        }
        @media (max-width: 380px){
          .tmd-profile-grid{ grid-template-columns: 1fr; }
        }
      `}</style>

      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Upload a photo first if you want your profile to be public.
      </p>

      {err && <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>}

      <form onSubmit={saveProfile} className="tmd-profile-grid">
        {/* Avatar column */}
        <div className="tmd-profile-avatar-col">
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

        {/* Right-side: handle + display name */}
        <div className="tmd-profile-top">
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
        </div>

        {/* ✅ Bio FULL WIDTH */}
        <label className="form-label tmd-profile-bio">
          Bio
          <textarea
            className="input"
            rows={5}
            value={profile.bio || ''}
            onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
            placeholder="A short intro…"
          />
        </label>

        {/* Lower controls */}
        <div className="tmd-profile-lower">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={!!profile.is_public}
              onChange={(e) => {
                const next = e.target.checked
                if (next && !profile.avatar_url) {
                  setErr('Upload a profile photo before making your profile public.')
                  setProfile((p) => ({ ...p, is_public: false }))
                  return
                }
                setProfile((p) => ({ ...p, is_public: next }))
              }}
            />
            Public profile
          </label>

          {!profile.avatar_url && (
            <div className="helper-muted" style={{ fontSize: 12 }}>
              Public profiles require a profile photo.
            </div>
          )}

          <div className="actions-row">
            <button className="btn btn-primary btn-pill" type="submit" disabled={!canSave}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </div>
      </form>

      <div style={{ marginTop: 26 }}>
        <ProfilePhotosManager userId={me.id} />
      </div>
    </div>
  )
}


























































