import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import QRCode from 'qrcode'

function ProfilePage(){
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({ handle:'', display_name:'', bio:'', mode:'dating', is_public:true })
  const [qr, setQr] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null))
  }, [])

  useEffect(() => {
    if (form.handle) {
      const url = `${window.location.origin}/u/${encodeURIComponent(form.handle)}`
      QRCode.toDataURL(url).then(setQr)
    } else setQr('')
  }, [form.handle])

  useEffect(() => {
    async function load(){
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

  async function save(){
    if (!user) return
    const payload = { ...form, user_id: user.id }
    const { error } = await supabase.from('profiles').upsert(payload).eq('user_id', user.id)
    if (error) alert(error.message); else alert('Saved!')
  }

  if (!user) return (
    <div style={{padding:40}}>
      Please sign in first. <a href="/auth">Go to Auth</a>
    </div>
  )

  return (
    <div style={{padding:40, maxWidth:720}}>
      <h2>Your Profile</h2>
      <div style={{display:'grid', gap:12}}>
        <label>
          Handle
          <input
            value={form.handle||''}
            onChange={e=>setForm({...form, handle:e.target.value.replace(/\s+/g,'').toLowerCase()})}
          />
        </label>
        <label>
          Display name
          <input
            value={form.display_name||''}
            onChange={e=>setForm({...form, display_name:e.target.value})}
          />
        </label>
        <label>
          Bio
          <textarea
            value={form.bio||''}
            onChange={e=>setForm({...form, bio:e.target.value})}
          />
        </label>
        <label>
          Mode
          <select value={form.mode} onChange={e=>setForm({...form, mode:e.target.value})}>
            <option value="dating">Dating</option>
            <option value="friends">Friends</option>
            <option value="browsing">Browsing</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!form.is_public}
            onChange={e=>setForm({...form, is_public:e.target.checked})}
          /> Public profile
        </label>
        <button onClick={save}>Save</button>
      </div>

      {!!qr && (
        <div style={{marginTop:20}}>
          <h3>Your QR code</h3>
          <img src={qr} alt="Profile QR" style={{width:160, height:160}}/>
          <div>{window.location.origin}/u/{form.handle}</div>
        </div>
      )}
    </div>
  )
}

// ✅ This line is essential:
export default ProfilePage

