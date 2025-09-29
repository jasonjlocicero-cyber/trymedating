// src/pages/ProfilePage.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ProfilePage({ me }) {
  const authed = !!me?.id
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [isPublic, setIsPublic] = useState(false)

  useEffect(() => {
    let cancel = false
    if (!authed) { setLoading(false); return }
    ;(async () => {
      setLoading(true); setErr('')
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name, handle, bio, public_profile')
          .eq('user_id', me.id)
          .maybeSingle()
        if (error) throw error
        if (!cancel && data) {
          setDisplayName(data.display_name || '')
          setHandle(data.handle || '')
          setBio(data.bio || '')
          setIsPublic(!!data.public_profile)
        }
      } catch (e) {
        if (!cancel) setErr(e.message || 'Failed to load profile')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [authed, me?.id])

  async function saveProfile(e) {
    e?.preventDefault?.()
    if (!authed) return
    setSaving(true); setErr('')
    try {
      // upsert by user_id
      const payload = {
        user_id: me.id,
        display_name: displayName || null,
        handle: handle || null,
        bio: bio || null,
        public_profile: isPublic
      }
      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' })
      if (error) throw error
      alert('Profile saved')
    } catch (e) {
      setErr(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!authed) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1>Profile</h1>
        <p>Please <a href="/auth">sign in</a> to edit your profile.</p>
      </div>
    )
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 720 }}>
      <h1>Profile</h1>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <form onSubmit={saveProfile} className="card" style={{ padding: 16, display: 'grid', gap: 12 }}>
          {err && <div style={{ color:'#b91c1c' }}>{err}</div>}

          <label>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Display name</div>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              style={input}
            />
          </label>

          <label>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Handle</div>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              placeholder="your-handle"
              style={input}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Public URL (if enabled): /u/{handle || 'your-handle'}
            </div>
          </label>

          <label>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Bio</div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short intro…"
              rows={4}
              style={{ ...input, resize:'vertical' }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <span>Make my profile public</span>
          </label>

          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      )}
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










