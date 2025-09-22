import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import QRCode from 'qrcode'

// Make any text a safe handle (slug)
const slugify = (s) =>
  (s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')        // spaces → dashes
    .replace(/[^a-z0-9\-]/g, '') // strip non-url chars
    .replace(/\-+/g, '-')        // collapse ---
    .replace(/^\-+|\-+$/g, '')   // trim - -

export default function ProfilePage() {
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({
    handle: '',
    display_name: '',
    bio: '',
    mode: 'dating',
    is_public: true,
    avatar_url: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [qr, setQr] = useState('')
  const [handleStatus, setHandleStatus] = useState('idle') // idle | checking | ok | taken | invalid
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Guard for missing env
  if (!supabase) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Your Profile</h2>
        <p>
          Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in
          Netlify → Site configuration → Environment, then redeploy.
        </p>
      </div>
    )
  }

  // 1) Get current user (redirect if not signed in)
  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/auth'
        return
      }
      setUser(user)
    })()
  }, [])

  // 2) Load existing profile row
  useEffect(() => {
    if (!user) return
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!error && data) setForm(prev => ({ ...prev, ...data }))
      setLoading(false)
    })()
  }, [user])

  // 3) Build QR when handle changes
  useEffect(() => {
    const build = async () => {
      if (!form.handle) return setQr('')
      const url = `${window.location.origin}/u/${encodeURIComponent(form.handle)}`
      setQr(await QRCode.toDataURL(url))
    }
    build()
  }, [form.handle])

  // 4) Debounced handle availability check
  useEffect(() => {
    if (!form.handle) { setHandleStatus('idle'); return }
    const val = slugify(form.handle)
    if (!val || val.length < 3) { setHandleStatus('invalid'); return }

    let alive = true
    setHandleStatus('checking')
    const t = setTimeout(async () => {
      // If it's already mine, it's OK
      const { data: mine } = await supabase
        .from('profiles')
        .select('handle,user_id')
        .eq('user_id', user?.id || '')
        .maybeSingle()
      if (mine && mine.handle === val) {
        if (alive) setHandleStatus('ok')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('handle')
        .eq('handle', val)
        .maybeSingle()
      if (!alive) return
      if (error) { setHandleStatus('invalid'); return }
      setHandleStatus(data ? 'taken' : 'ok')
    }, 350)

    return () => { alive = false; clearTimeout(t) }
  }, [form.handle, user])

  // Helpers
  const onChange = (patch) => setForm(prev => ({ ...prev, ...patch }))
  const publicUrl = useMemo(
    () => (form.handle ? `${window.location.origin}/u/${encodeURIComponent(slugify(form.handle))}` : ''),
    [form.handle]
  )

  // 5) Avatar upload to Storage (bucket: avatars)
  async function onAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setAvatarUploading(true)
    setMessage('')
    try {
      const maxSize = 2 * 1024 * 1024 // 2 MB
      if (file.size > maxSize) throw new Error('Max file size is 2 MB')
      if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) throw new Error('Use PNG/JPG/WEBP/GIF')

      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `users/${user.id}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: false })
      if (upErr) throw upErr

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = pub?.publicUrl
      if (!url) throw new Error('Could not get public URL')

      setForm(prev => ({ ...prev, avatar_url: url }))
      setMessage('Avatar uploaded ✓ (click Save to persist)')
    } catch (e2) {
      setMessage(e2.message || 'Upload failed')
    } finally {
      setAvatarUploading(false)
      if (e?.target) e.target.value = ''
    }
  }

  // 6) Save profile (upsert with explicit conflict target)
  async function save() {
    setMessage('')
    if (!user) return
    const handle = slugify(form.handle)
    if (!handle || handleStatus !== 'ok') {
      setMessage('Please choose an available handle (3+ letters/numbers).')
      return
    }
    if (!form.display_name) {
      setMessage('Display name is required.')
      return
    }
    setSaving(true)
    const payload = {
      user_id: user.id,
      handle,
      display_name: form.display_name.trim(),
      bio: (form.bio || '').trim(),
      mode: form.mode,
      is_public: !!form.is_public,
      avatar_url: form.avatar_url || null
    }

    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' }) // ✅ key change here

    setSaving(false)
    if (error) setMessage(error.message)
    else setMessage('Profile saved ✅')
  }

  // Utilities
  function copyLink() {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    setMessage('Link copied to clipboard ✅')
  }
  function downloadQR() {
    if (!qr) return
    const a = document.createElement('a')
    a.href = qr
    a.download = `trymedating-${form.handle}-qr.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  useEffect(() => { document.title = 'Your Profile • TryMeDating' }, [])
  if (loading) return <div style={{ padding: 40 }}>Loading…</div>

  return (
    <div style={{ padding: 40, maxWidth: 720, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h2>Your Profile</h2>

      {/* Avatar */}
      <div style={{ display:'flex', alignItems:'center', gap:16, marginTop:12 }}>
        <img
          src={form.avatar_url || 'https://via.placeholder.com/96?text=%F0%9F%98%8A'}
          alt="Avatar"
          style={{ width:96, height:96, borderRadius:'50%', objectFit:'cover', border:'1px solid #eee' }}
        />
        <label style={{ display:'inline-block' }}>
          <span style={{ display:'block', fontSize:13, marginBottom:6 }}>Avatar</span>
          <input type="file" accept="image/*" onChange={onAvatarChange} disabled={avatarUploading} />
          {avatarUploading && <div style={{ fontSize:12, opacity:.7 }}>Uploading…</div>}
        </label>
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {/* Handle */}
        <label>
          Handle <span style={{ opacity:.6 }}>(public URL)</span>
          <input
            value={form.handle}
            onChange={e => onChange({ handle: slugify(e.target.value) })}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6, marginTop: 4 }}
            placeholder="sarah-nc"
          />
          <div style={{ marginTop: 6, fontSize: 13 }}>
            {handleStatus === 'idle' && <span style={{ opacity:.6 }}>3+ chars, letters/numbers/dashes</span>}
            {handleStatus === 'checking' && <span>Checking availability…</span>}
            {handleStatus === 'ok' && <span style={{ color: '#007A7A' }}>Available ✓</span>}
            {handleStatus === 'taken' && <span style={{ color: '#E03A3A' }}>Already taken</span>}
            {handleStatus === 'invalid' && <span style={{ color: '#E03A3A' }}>Invalid handle</span>}
          </div>
          {!!publicUrl && (
            <div style={{ marginTop: 6, fontSize: 13, opacity:.8 }}>
              Public link: <code>{publicUrl}</code>
              <button onClick={copyLink} style={{ marginLeft: 8, padding:'4px 8px' }}>Copy</button>
            </div>
          )}
        </label>

        {/* Display name */}
        <label>
          Display name
          <input
            value={form.display_name}
            onChange={e => onChange({ display_name: e.target.value })}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6, marginTop: 4 }}
            placeholder="Sarah"
          />
        </label>

        {/* Bio */}
        <label>
          Bio
          <textarea
            value={form.bio}
            onChange={e => onChange({ bio: e.target.value })}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6, marginTop: 4, minHeight: 100 }}
            placeholder="Coffee shop enthusiast, weekend hiker."
          />
        </label>

        {/* Mode */}
        <label>
          Mode
          <select
            value={form.mode}
            onChange={e => onChange({ mode: e.target.value })}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6, marginTop: 4 }}
          >
            <option value="dating">Dating</option>
            <option value="friends">Friends</option>
            <option value="browsing">Browsing</option>
          </select>
        </label>

        {/* Public toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={!!form.is_public}
            onChange={e => onChange({ is_public: e.target.checked })}
          />
          Public profile
        </label>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={save} disabled={saving || handleStatus !== 'ok'} style={{ padding:'10px 14px' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {!!qr && <button onClick={downloadQR} style={{ padding:'10px 14px' }}>Download QR</button>}
        </div>

        {message && <div style={{ marginTop: 6 }}>{message}</div>}
      </div>

      {!!qr && (
        <div style={{ marginTop: 24 }}>
          <h3>Your QR code</h3>
          <img src={qr} alt="Profile QR" style={{ width: 160, height: 160 }} />
          <div style={{ opacity: 0.8, marginTop: 6 }}>{publicUrl}</div>
        </div>
      )}
    </div>
  )
}


