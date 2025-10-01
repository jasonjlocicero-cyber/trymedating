// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useState } from 'react'
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

  // model
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [publicProfile, setPublicProfile] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)

  // derived
  const needsOnboarding = useMemo(
    () => authed && (!displayName || !handle),
    [authed, displayName, handle]
  )

  // Load current profile
  useEffect(() => {
    let cancel = false
    if (!authed) {
      setLoading(false)
      return
    }
    ;(async () => {
      setLoading(true); setErr(''); setOk('')
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name, handle, bio, public_profile, avatar_url')
          .eq('user_id', me.id)
          .maybeSingle()
        if (error) throw error
        if (!cancel && data) {
          setDisplayName(data.display_name || '')
          setHandle(data.handle || '')
          setBio(data.bio || '')
          setPublicProfile(!!data.public_profile)
          setAvatarUrl(data.avatar_url || null)
        }
      } catch (e) {
        if (!cancel) setErr(e.message || 'Failed to load profile')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [authed, me?.id])

  // helpers
  function normalizeHandle(v) {
    return v.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 32)
  }

  async function saveProfile(e) {
    e?.preventDefault?.()
    if (!authed) return
    setSaving(true); setErr(''); setOk('')
    try {
      if (publicProfile && !handle.trim()) {
        throw new Error('Handle is required when your profile is public.')
      }
      const payload = {
        user_id: me.id,
        display_name: displayName || null,
        handle: handle ? normalizeHandle(handle) : null,
        bio: bio || null,
        public_profile: publicProfile,
        avatar_url: avatarUrl || null
      }
      const { error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'user_id' })
      if (error) throw error
      setOk('Profile saved')
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

  // build URLs used in hints/QR
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = handle ? `${origin}/u/${handle}` : ''
  const inviteUrl = `${origin}/auth?invite=${encodeURIComponent(me.id)}` // placeholder invite; adapt when you add real accept flow

  return (
    <div className="container" style={{ padding: 24, maxWidth: 860 }}>
      <h1>Profile</h1>

      {/* Private reminder banner */}
      {!publicProfile && (
        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 12,
            background: '#fff8e1',
            border: '1px solid #f6ce52',
            borderLeft: '4px solid #f59e0b',
            color: '#5b4b1e'
          }}
        >
          Your profile is currently <strong>private</strong>. Others can’t view it unless you make it public.
        </div>
      )}

      {/* Onboarding nudge */}
      {needsOnboarding && (
        <div className="card" style={{ padding:12, borderLeft:'4px solid var(--secondary)', marginBottom:12, background:'#fffaf7' }}>
          <strong>Finish your setup:</strong> add a display name and handle, and an optional photo.
        </div>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <form onSubmit={saveProfile} className="card" style={{ padding: 16, display:'grid', gap: 18 }}>
          {err && <div style={{ color:'#b91c1c' }}>{err}</div>}
          {ok && <div style={{ color:'#166534' }}>{ok}</div>}

          {/* Avatar */}
          <section>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Photo</div>
            <AvatarUploader userId={me.id} value={avatarUrl} onChange={setAvatarUrl} />
            <div className="muted" style={{ fontSize:12, marginTop:6 }}>
              Square crop • auto-compress for fast loads (recommended 320×320+).
            </div>
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

          {/* Handle */}
          <label>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Handle</div>
            <input
              value={handle}
              onChange={(e)=>setHandle(normalizeHandle(e.target.value))}
              placeholder="your-handle"
              style={input}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {publicProfile
                ? <>Public URL: <code>/u/{handle || 'your-handle'}</code></>
                : <>Handle is optional until you go public.</>
              }
            </div>
          </label>

          {/* Bio */}
          <label>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Bio</div>
            <textarea
              value={bio}
              onChange={(e)=>setBio(e.target.value)}
              placeholder="A short intro…"
              rows={4}
              style={{ ...input, resize:'vertical' }}
            />
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
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            {publicProfile && handle && (
              <a href={`/u/${handle}`} className="btn" style={{ textDecoration:'none' }}>
                View public profile
              </a>
            )}
          </div>

          {/* Invite QR — profile-only (not shown on public profile page) */}
          <section className="card" style={{ padding:12, marginTop: 4 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontWeight:800, marginBottom:4 }}>Your invite QR</div>
                <div className="muted" style={{ fontSize:12 }}>
                  Share in person. Scanning sends people to: <code>/auth?invite=…</code>
                </div>
              </div>
              <div style={{ background:'#fff', padding:8, borderRadius:12, border:'1px solid var(--border)' }}>
                <QRCode value={inviteUrl} size={120} />
              </div>
            </div>
            <div style={{ marginTop:8, display:'flex', gap:8, flexWrap:'wrap' }}>
              <a className="btn" href={inviteUrl} target="_blank" rel="noreferrer">Open invite link</a>
              {publicProfile && handle && (
                <a className="btn" href={publicUrl} target="_blank" rel="noreferrer">Open public URL</a>
              )}
            </div>
          </section>
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












