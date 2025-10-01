// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
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

  // handle validation state
  const [handleMsg, setHandleMsg] = useState('')
  const [handleOk, setHandleOk] = useState(null)      // true | false | null
  const [checkingHandle, setCheckingHandle] = useState(false)

  // copy feedback
  const [copiedPublicTop, setCopiedPublicTop] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [copiedPublicQR, setCopiedPublicQR] = useState(false)

  // derived
  const needsOnboarding = useMemo(
    () => authed && (!displayName || !handle),
    [authed, displayName, handle]
  )

  // reserved list
  const RESERVED = useRef(new Set([
    'admin','administrator','support','moderator',
    'help','root','system','trymedating','api','www','null'
  ]))

  // normalize handle
  function normalizeHandle(v) {
    return v.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 32)
  }

  // load current profile
  useEffect(() => {
    let cancel = false
    if (!authed) { setLoading(false); return }
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

  // local validation
  function validateHandleLocal(v, reservedSet) {
    const clean = v.toLowerCase()
    if (!clean) return { ok: false, msg: 'Handle is required when public.' }
    if (clean.length < 3) return { ok: false, msg: 'Minimum 3 characters.' }
    if (clean.length > 32) return { ok: false, msg: 'Maximum 32 characters.' }
    if (!/^[a-z0-9-_]+$/.test(clean)) return { ok: false, msg: 'Use lowercase letters, numbers, - or _ only.' }
    if (reservedSet.has(clean)) return { ok: false, msg: 'That handle is reserved.' }
    return { ok: true, msg: '' }
  }

  // live validation + server check
  useEffect(() => {
    if (!authed) return
    const value = handle?.trim() || ''

    const local = validateHandleLocal(value, RESERVED.current)
    if (!local.ok) {
      setHandleOk(false)
      setHandleMsg(local.msg)
      return
    }
    if (!value) {
      setHandleOk(null); setHandleMsg(''); return
    }

    setCheckingHandle(true)
    setHandleMsg('Checking availability…')
    setHandleOk(null)
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('handle', value)
          .neq('user_id', me.id)   // your own handle is allowed
          .maybeSingle()
        if (error) throw error
        if (data) {
          setHandleOk(false)
          setHandleMsg('That handle is already taken.')
        } else {
          setHandleOk(true)
          setHandleMsg('Handle is available ✓')
        }
      } catch (e) {
        setHandleOk(null)
        setHandleMsg('Could not verify handle right now.')
      } finally {
        setCheckingHandle(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [handle, authed, me?.id])

  // save profile
  async function saveProfile(e) {
    e?.preventDefault?.()
    if (!authed) return
    setSaving(true); setErr(''); setOk('')
    try {
      if (publicProfile) {
        const local = validateHandleLocal(handle.trim(), RESERVED.current)
        if (!local.ok) throw new Error(local.msg)
        const { data: dupe } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('handle', handle.trim())
          .neq('user_id', me.id)
          .maybeSingle()
        if (dupe) throw new Error('That handle is already taken.')
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

  // copy helpers
  function copyText(text, setFlag) {
    navigator.clipboard.writeText(text)
    setFlag(true)
    setTimeout(()=>setFlag(false), 1500)
  }

  if (!authed) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1>Profile</h1>
        <p>Please <a href="/auth">sign in</a> to edit your profile.</p>
      </div>
    )
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = handle ? `${origin}/u/${handle}` : ''
  const inviteUrl = `${origin}/auth?invite=${encodeURIComponent(me.id)}`

  return (
    <div className="container" style={{ padding: 24, maxWidth: 860 }}>
      <h1>Profile</h1>

      {!publicProfile && (
        <div className="card" style={{
          padding: 12, marginBottom: 12, background: '#fff8e1',
          border: '1px solid #f6ce52', borderLeft: '4px solid #f59e0b', color: '#5b4b1e'
        }}>
          Your profile is <strong>private</strong>. Others can’t view it unless you make it public.
        </div>
      )}

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

          {/* Handle with validation + copy (top) */}
          <label>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Handle</div>
            <input
              value={handle}
              onChange={(e)=>setHandle(normalizeHandle(e.target.value))}
              placeholder="your-handle"
              style={{
                ...input,
                borderColor: handleOk === false ? '#b91c1c'
                  : handleOk === true ? '#16a34a'
                  : 'var(--border)'
              }}
            />
            <div style={{ fontSize:12, marginTop:4,
              color: handleOk === false ? '#b91c1c'
                : handleOk === true ? '#166534'
                : 'var(--muted)' }}>
              {publicProfile
                ? (handleMsg || 'Public URL: ' + (handle ? `/u/${handle}` : '/u/your-handle'))
                : (handleMsg || 'Handle is optional until you go public.')
              }
            </div>

            {publicProfile && handleOk && handle && (
              <button
                type="button"
                className="btn"
                style={{ marginTop:6 }}
                onClick={() => copyText(publicUrl, setCopiedPublicTop)}
              >
                {copiedPublicTop ? 'Copied!' : 'Copy Public URL'}
              </button>
            )}
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
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={saving || (publicProfile && (handleOk === false || checkingHandle))}
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            {publicProfile && handle && (
              <a href={`/u/${handle}`} className="btn">View public profile</a>
            )}
          </div>

          {/* Invite QR + Copy buttons */}
          <section className="card" style={{ padding:12, marginTop: 4 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:800, marginBottom:4 }}>Your invite QR</div>
                <div className="muted" style={{ fontSize:12 }}>
                  Share in person. Scanning sends people to: <code>/auth?invite=…</code>
                </div>
                <div style={{ marginTop:8, display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => copyText(inviteUrl, setCopiedInvite)}
                  >
                    {copiedInvite ? 'Copied!' : 'Copy Invite Link'}
                  </button>
                  {publicProfile && handleOk && handle && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => copyText(publicUrl, setCopiedPublicQR)}
                    >
                      {copiedPublicQR ? 'Copied!' : 'Copy Public URL'}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ background:'#fff', padding:8, borderRadius:12, border:'1px solid var(--border)' }}>
                <QRCode value={inviteUrl} size={120} />
              </div>
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













