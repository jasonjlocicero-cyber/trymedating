// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function ProfilePage() {
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState(null)

  // form state
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')
  const [publicProfile, setPublicProfile] = useState(false)

  // ui state
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const [msg, setMsg] = useState('')

  // 1) Hydrate auth
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setUser(user || null)
      setAuthLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user || null)
    })
    return () => {
      alive = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  // 2) Load profile when user ready
  useEffect(() => {
    if (!user?.id) return
    let cancel = false
    ;(async () => {
      setLoading(true); setLoadErr(''); setMsg('')
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name, handle, city, bio, public_profile')
          .eq('user_id', user.id)
          .single()
        if (error && error.code !== 'PGRST116') throw error
        if (!cancel && data) {
          setDisplayName(data.display_name || '')
          setHandle(data.handle || '')
          setCity(data.city || '')
          setBio(data.bio || '')
          setPublicProfile(!!data.public_profile)
        }
      } catch (e) {
        if (!cancel) setLoadErr(e.message || 'Failed to load profile')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [user?.id])

  async function saveProfile(e) {
    e?.preventDefault?.()
    if (!user?.id) return
    setSaving(true); setSaveErr(''); setMsg('')
    try {
      const cleanHandle = (handle || '').trim().toLowerCase()
      if (publicProfile && !cleanHandle) {
        throw new Error('Add a handle to make your profile public.')
      }

      const payload = {
        user_id: user.id,
        display_name: displayName || null,
        handle: cleanHandle || null,
        city: city || null,
        bio: bio || '',
        public_profile: !!publicProfile
      }

      const { error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'user_id' })
      if (error) throw error

      setMsg('Profile saved.')
    } catch (e) {
      setSaveErr(e.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  // Progress bar
  const progress = useMemo(() => {
    const parts = [
      displayName?.trim(),
      handle?.trim(),
      city?.trim(),
      bio?.trim(),
      publicProfile ? 'yes' : ''
    ]
    const filled = parts.filter(Boolean).length
    return Math.round((filled / parts.length) * 100)
  }, [displayName, handle, city, bio, publicProfile])

  const publicUrl = useMemo(() => {
    if (!handle) return ''
    return `${window.location.origin}/u/${handle}`
  }, [handle])

  // UI states
  if (authLoading) {
    return (
      <div className="container" style={{ padding: '28px 0' }}>
        <div className="muted">Checking your session…</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container" style={{ padding: '28px 0' }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Please sign in</h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          You need to sign in to edit your profile.
        </p>
        <Link className="btn btn-primary" to="/auth">Go to sign in</Link>
      </div>
    )
  }

  return (
    <div className="container" style={{ padding: '28px 0', maxWidth: 900 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:24, flexWrap:'wrap' }}>
        {/* Left: Editor */}
        <div style={{ flex:'1 1 520px', minWidth: 320 }}>
          <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>

          {/* Progress */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
              <div className="muted">Profile completeness</div>
              <div className="muted">{progress}%</div>
            </div>
            <div style={{
              height: 10,
              background:'#f1f5f9',
              border:'1px solid var(--border)',
              borderRadius: 999,
              overflow:'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #0f766e, #f43f5e)'
              }} />
            </div>
          </div>

          {loadErr && <div className="helper-error" style={{ marginBottom: 12 }}>{loadErr}</div>}
          {saveErr && <div className="helper-error" style={{ marginBottom: 12 }}>{saveErr}</div>}
          {msg && <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>}

          <form onSubmit={saveProfile} style={{ display:'grid', gap:12 }}>
            <label className="form-label">
              Display name
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </label>

            <label className="form-label">
              Handle
              <input
                className="input"
                value={handle}
                onChange={(e) => setHandle(e.target.value.trim().toLowerCase())}
                placeholder="your-handle"
              />
              <div className="helper-muted">Your public URL will be /u/&lt;handle&gt;</div>
            </label>

            <label className="form-label">
              City
              <input
                className="input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City, State"
              />
            </label>

            <label className="form-label">
              Bio
              <textarea
                className="input"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short introduction…"
              />
            </label>

            <label className="form-check" style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input
                type="checkbox"
                checked={publicProfile}
                onChange={(e) => setPublicProfile(e.target.checked)}
              />
              Make my profile public
            </label>

            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn btn-primary" disabled={saving} type="submit">
                {saving ? 'Saving…' : 'Save profile'}
              </button>
              {handle && publicProfile && (
                <>
                  <Link className="btn btn-neutral" to={`/u/${handle}`} target="_blank" rel="noreferrer">
                    View public profile
                  </Link>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(publicUrl)
                      setMsg('Public URL copied to clipboard.')
                      setTimeout(() => setMsg(''), 2000)
                    }}
                  >
                    Copy public URL
                  </button>
                </>
              )}
            </div>
          </form>
        </div>

        {/* Right: QR & tips (image QR fallback — no extra package needed) */}
        <aside style={{
          flex:'0 0 300px',
          minWidth: 260,
          border:'1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          background:'#fff'
        }}>
          <h3 style={{ fontWeight: 800, marginTop: 0, marginBottom: 8 }}>Invite via QR</h3>
          {!handle && (
            <div className="helper-error" style={{ marginBottom: 8 }}>
              Add a handle to enable your invite QR.
            </div>
          )}
          {handle && (
            <div style={{ display:'grid', placeItems:'center', marginBottom: 12 }}>
              <div style={{ background:'#fff', padding:12, border:'1px solid var(--border)', borderRadius: 8 }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicUrl)}`}
                  alt="Invite QR code"
                  width={180}
                  height={180}
                  style={{ display:'block' }}
                />
              </div>
            </div>
          )}
          <div className="muted" style={{ lineHeight: 1.55 }}>
            Share this QR with people you meet. It points to your public URL:
            <br />
            <code style={{ wordBreak:'break-all' }}>{publicUrl || '—'}</code>
          </div>
        </aside>
      </div>
    </div>
  )
}



















