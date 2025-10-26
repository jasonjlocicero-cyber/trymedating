// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

function sanitizeHandle(s) {
  const base = (s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '').slice(0, 24).replace(/^_+|_+$/g, '')
  return base || 'user'
}

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

  // Ensure we have a profile for the signed-in user
  useEffect(() => {
    if (!me?.id) return
    let mounted = true

    async function ensureProfile() {
      setLoading(true); setErr(''); setMsg('')
      try {
        // 1) Try to fetch existing by user_id
        const { data: existing, error: selErr } = await supabase
          .from('profiles')
          .select('handle, display_name, bio, is_public')
          .eq('user_id', me.id)
          .maybeSingle()
        if (selErr) throw selErr
        if (existing) {
          if (mounted) setProfile(existing)
          return
        }

        // 2) Auto-provision a profile if missing
        const emailBase = sanitizeHandle(me.email?.split('@')[0] || me.id.slice(0, 6))
        let attempt = 0
        while (true) {
          const candidate = attempt === 0 ? emailBase : `${emailBase}${attempt}`
          const toInsert = {
            user_id: me.id,
            handle: candidate,
            display_name: me.user_metadata?.full_name || candidate,
            is_public: true,
            bio: ''
          }
          const { data: created, error: insErr } = await supabase
            .from('profiles')
            .insert(toInsert)
            .select('handle, display_name, bio, is_public')
            .single()

          if (!insErr) {
            if (mounted) setProfile(created)
            break
          }
          // 23505 = unique_violation (handle taken) -> try next
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
    return () => { mounted = false }
  }, [me?.id])

  const canSave = useMemo(() => !!me?.id && !!profile.handle?.trim() && !saving, [me?.id, profile, saving])

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
        .select('handle, display_name, bio, is_public')
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
    <div className="container" style={{ padding: '28px 0', maxWidth: 720 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Your public handle and basic details. Others can see your profile if you set it to public.
      </p>

      {err && <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>}

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
          <div className="muted" style={{ fontSize: 12 }}>
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
            rows={3}
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

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={!canSave}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  )
}




















