import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import QRCode from 'qrcode'

const slugify = (s) =>
  s.toLowerCase().trim()
   .replace(/\s+/g, '-')        // spaces → dashes
   .replace(/[^a-z0-9\-]/g, '') // remove non-url chars
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
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [qr, setQr] = useState('')
  const [handleStatus, setHandleStatus] = useState('idle') // idle | checking | ok | taken | invalid

  // Guard if Supabase isn’t configured
  if (!supabase) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Your Profile</h2>
        <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Netlify env, then redeploy.</p>
      </div>
    )
  }

  // Get current user; redirect if not logged in
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/auth'
        return
      }
      setUser(user)
    })()
  }, [])

  // Load existing profile
  useEffect(() => {
    if (!user) return
    ;(async () => {
      setLoading(true)
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
      if (data) setForm(prev => ({ ...prev, ...data }))
      setLoading(false)
    })()
  }, [user])

  // Generate QR when handle changes
  useEffect(() => {
    const makeQR = async () => {
      if (!form.handle) return setQr('')
      const url = `${window.location.origin}/u/${encodeURIComponent(form.handle)}`
      const dataUrl = await QRCode.toDataURL(url)
      setQr(dataUrl)
    }
    makeQR()
  }, [form.handle])

  // Check handle availability (debounced)
  useEffect(() => {
    if (!form.handle) { setHandleStatus('idle'); return }
    const val = slugify(form.handle)
    if (!val || val.length < 3) { setHandleStatus('invalid'); return }

    let alive = true
    setHandleStatus('checking')
    const t = setTimeout(async () => {
      // If user is editing and already owns this handle, mark ok
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

  // Derived
  const publicUrl = useMemo(
    () => (form.handle ? `${window.location.origin}/u/${encodeURIComponent(slugify(form.handle))}` : ''),
    [form.handle]
  )

  // Actions
  const onChange = (patch) => setForm(prev => ({ ...prev, ...patch }))

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
      display_name: form.display_name,
      bio: form.bio,
      mode: form.mode,
      is_public: !!form.is_public,
    }
    const { error } = await supabase.from('profiles').upsert(payload).eq('user_id', user.id)
    setSaving(false)
    if (error) setMessage(error.message)
    else setMessage('Profile saved ✅')
  }

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

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
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

        <label>
          Display name
          <input
            value={form.display_name}
            onChange={e => onChange({ display_name: e.target.value })}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6, marginTop: 4 }}
            placeholder="Sarah"
          />
        </label>

        <label>
          Bio
          <textarea
            value={form.bio}
            onChange={e => onChange({ bio: e.target.value })}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 6, marginTop: 4, minHeight: 100 }}
            placeholder="Coffee shop enthusiast, weekend hiker."
          />
        </label>

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

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={!!form.is_public}
            onChange={e => onChange({ is_public: e.target.checked })}
          />
          Public profile
        </label>

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

