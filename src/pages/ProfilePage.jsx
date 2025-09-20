import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import QRCode from 'qrcode'

export default function ProfilePage() {
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({
    handle: '',
    display_name: '',
    bio: '',
    mode: 'dating',
    is_public: true,
  })
  const [qr, setQr] = useState('')
  const [message, setMessage] = useState('')

  // ✅ Guard: if Supabase client is missing, show message instead of crashing
  if (!supabase) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Your Profile</h2>
        <p>
          Supabase is not configured. Add{' '}
          <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> in Netlify → Site configuration → Build & deploy → Environment, then redeploy.
        </p>
      </div>
    )
  }

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null))
  }, [])

  // Generate QR code when handle changes
  useEffect(() => {
    if (form.handle) {
      const url = `${window.location.origin}/u/${encodeURIComponent(form.handle)}`
      QRCode.toDataURL(url).then(setQr)
    } else {
      setQr('')
    }
  }, [form.handle])

  // Load profile from DB
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()
      if (data) setForm(prev => ({ ...prev, ...data }))
    }
    load()
  }, [])

  // Save profile
  async function save() {
    if (!user) return
    setMessage('')
    const payload = { ...form, user_id: user.id }
    const { error } = await supabase
      .from('profiles')
      .upsert(payload)
      .eq('user_id', user.id)
    if (error) setMessage(error.message)
    else setMessage('Profile saved ✅')
  }

  if (!user) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Your Profile</h2>
        <p>
          Please sign in first. <a href="/auth">Go to Auth</a>
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 40, maxWidth: 720, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h2>Your Profile</h2>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label>
          Handle (used in your public link)
          <input
            value={form.handle || ''}
            onChange={e =>
              setForm({
                ...form,
                handle: e.target.value.replace(/\s+/g, '').toLowerCase(),
              })
            }
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6, marginTop: 4 }}
            placeholder="sarah-nc"
          />
        </label>

        <label>
          Display name
          <input
            value={form.display_name || ''}
            onChange={e => setForm({ ...form, display_name: e.target.value })}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6, marginTop: 4 }}
            placeholder="Sarah"
          />
        </label>

        <label>
          Bio
          <textarea
            value={form.bio || ''}
            onChange={e => setForm({ ...form, bio: e.target.value })}
            style={{
              padding: 10,
              border: '1px solid #ddd',
              borderRadius: 6,
              marginTop: 4,
              minHeight: 100,
            }}
            placeholder="Coffee shop enthusiast, weekend hiker."
          />
        </label>

        <label>
          Mode
          <select
            value={form.mode}
            onChange={e => setForm({ ...form, mode: e.target.value })}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6, marginTop: 4 }}
          >
            <option value="dating">Dating</option>
            <option value="friends">Friends</option>
            <option value="browsing">Browsing</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={!!form.is_public}
            onChange={e => setForm({ ...form, is_public: e.target.checked })}
          />
          Public profile
        </label>

        <button
          onClick={save}
          style={{
            padding: '10px 14px',
            background: '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Save
        </button>
      </div>

      {message && <p style={{ marginTop: 12 }}>{message}</p>}

      {qr && (
        <div style={{ marginTop: 24 }}>
          <h3>Your QR code</h3>
          <img src={qr} alt="Profile QR" style={{ width: 160, height: 160 }} />
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            {window.location.origin}/u/{form.handle}
          </div>
        </div>
      )}
    </div>
  )
}


// ✅ This line is essential:
export default ProfilePage

