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

  // Delete account UI state
  const [showDelete, setShowDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleteChecked, setDeleteChecked] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState('')

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
        // 1) Try to fetch existing
        const { data: existing, error: selErr } = await supabase
          .from('profiles')
          .select('handle, display_name, bio, is_public, avatar_url')
          .eq('user_id', me.id)
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

          const { data: created, error: insErr } = await supabase
            .from('profiles')
            .insert(toInsert)
            .select('handle, display_name, bio, is_public, avatar_url')
            .single()

          if (!insErr) {
            if (mounted) setProfile(created)
            break
          }

          if (insErr?.code === '23505') {
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

      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('user_id', me.id)
        .select('handle, display_name, bio, is_public, avatar_url')
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

  async function handleUploadAvatar(ev) {
    try {
      const file = ev.target.files?.[0]
      if (!file || !me?.id) return
      setUploading(true)
      setErr('')
      setMsg('')

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${me.id}/${Date.now()}.${ext}`

      // ensure bucket "avatars" exists in your project
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg'
      })
      if (upErr) throw upErr

      const { data: pub } = await supabase.storage.from('avatars').getPublicUrl(path)
      const url = pub?.publicUrl || ''

      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('user_id', me.id)
        .select('handle, display_name, bio, is_public, avatar_url')
        .single()

      if (error) throw error
      setProfile(data)
      setMsg('Photo updated!')
    } catch (e) {
      setErr(e.message || 'Upload failed')
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

      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('user_id', me.id)
        .select('handle, display_name, bio, is_public, avatar_url')
        .single()

      if (error) throw error
      setProfile(data)
      setMsg('Photo removed.')
    } catch (e) {
      setErr(e.message || 'Failed to remove photo')
    } finally {
      setUploading(false)
    }
  }

  async function doDeleteAccount() {
    setDeleteErr('')
    if (deleteText.trim().toUpperCase() !== 'DELETE') {
      setDeleteErr('Type DELETE to confirm.')
      return
    }
    if (!deleteChecked) {
      setDeleteErr('Please check the confirmation box.')
      return
    }

    setDeleting(true)
    try {
      // Calls the SECURITY DEFINER RPC you added in Supabase SQL
      const { error } = await supabase.rpc('tmd_delete_account')
      if (error) throw error

      // Session may still exist client-side; sign out + go home
      await supabase.auth.signOut()
      window.location.assign('/')
    } catch (e) {
      setDeleteErr(e.message || 'Failed to delete account.')
    } finally {
      setDeleting(false)
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
    <div className="container profile-page" style={{ padding: '28px 0', maxWidth: 920 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Keep it simple. Your handle is public; toggle visibility anytime.
      </p>

      {err && <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="profile-grid">
        {/* Avatar column */}
        <div className="profile-avatar-col">
          <div className="avatar-frame profile-avatar-frame">
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

          <div className="profile-avatar-actions">
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
        <form onSubmit={saveProfile} className="profile-form-grid">
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

          <label className="form-label profile-public-row">
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

      {/* ✅ Danger zone */}
      <div className="danger-zone" style={{ marginTop: 22 }}>
        <div>
          <div className="danger-zone__title">Danger zone</div>
          <div className="danger-zone__text">
            Deleting your account permanently removes your profile, photos, connections, and messages.
            (Some records may be retained where legally required for investigations.)
          </div>
        </div>

        <button
          type="button"
          className="btn btn-danger btn-pill"
          onClick={() => {
            setShowDelete(true)
            setDeleteErr('')
            setDeleteText('')
            setDeleteChecked(false)
          }}
        >
          Delete account
        </button>
      </div>

      {/* Delete modal */}
      {showDelete && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Delete account"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting) setShowDelete(false)
          }}
        >
          <div className="modal-card">
            <div className="modal-title">Delete account</div>
            <div className="modal-body">
              This action is permanent. Type <b>DELETE</b> to confirm.
            </div>

            <input
              className="input"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="Type DELETE"
              disabled={deleting}
            />

            <label className="modal-check">
              <input
                type="checkbox"
                checked={deleteChecked}
                onChange={(e) => setDeleteChecked(e.target.checked)}
                disabled={deleting}
              />
              I understand this cannot be undone.
            </label>

            {deleteErr && <div className="helper-error" style={{ marginTop: 8 }}>{deleteErr}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-neutral btn-pill"
                onClick={() => setShowDelete(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-pill"
                onClick={doDeleteAccount}
                disabled={deleting}
                title="Permanently delete your account"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

























