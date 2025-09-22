import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function SettingsPage() {
  const [user, setUser] = useState(null)
  const [pw, setPw] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // Friendly message if env vars are missing
  if (!supabase) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Settings</h2>
        <p>
          Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> to Netlify Environment variables and redeploy.
        </p>
      </div>
    )
  }

  useEffect(() => {
    document.title = 'Settings • TryMeDating'
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/auth'
        return
      }
      setUser(user)
    })()
  }, [])

  // CHANGE PASSWORD
  async function changePassword(e) {
    e.preventDefault()
    if (!pw || pw.length < 8) {
      setMsg('Password must be at least 8 characters.')
      return
    }
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setMsg(error.message)
    else {
      setPw('')
      setMsg('Password updated ✅')
    }
  }

  // CHANGE EMAIL
  async function changeEmail(e) {
    e.preventDefault()
    if (!newEmail) {
      setMsg('Enter a new email.')
      return
    }
    setBusy(true); setMsg('')
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail })
      if (error) setMsg(error.message)
      else {
        setMsg('If confirmations are enabled, check your inbox to confirm the change.')
        setNewEmail('')
      }
    } catch (err) {
      setMsg(err.message || 'Email update failed.')
    } finally {
      setBusy(false)
    }
  }

  // SIGN OUT
  async function signOut() {
    setBusy(true); setMsg('')
    await supabase.auth.signOut()
    setBusy(false)
    window.location.href = '/auth'
  }

  // DELETE ACCOUNT (calls Netlify Function with service_role)
  async function deleteAccount() {
    if (!user) return
    const sure = confirm('This permanently deletes your account and profile. Continue?')
    if (!sure) return
    setBusy(true); setMsg('Deleting account…')

    // Get access token for verification
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setBusy(false)
      setMsg('No active session. Please sign in again.')
      return
    }

    try {
      const res = await fetch('/.netlify/functions/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ user_id: user.id })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Delete failed')

      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (e) {
      setMsg(e.message)
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 40, maxWidth: 640, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h2>Settings</h2>

      <section style={{ marginTop: 20 }}>
        <h3>Account</h3>
        <div style={{ opacity:.8, fontSize:14, marginBottom:12 }}>
          Signed in as: {user?.email}
        </div>

        {/* Change Password */}
        <form onSubmit={changePassword} style={{ display:'grid', gap:12, maxWidth:420 }}>
          <label>
            New password
            <input
              type="password"
              placeholder="At least 8 characters"
              value={pw}
              onChange={e=>setPw(e.target.value)}
              style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #ddd', marginTop:6 }}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !pw}
            style={{ padding:'10px 14px', borderRadius:10, border:'none', background:'#2A9D8F', color:'#fff', fontWeight:700, cursor: busy?'not-allowed':'pointer' }}
          >
            {busy ? 'Working…' : 'Change password'}
          </button>
        </form>

        {/* Change Email */}
        <form onSubmit={changeEmail} style={{ display:'grid', gap:12, maxWidth:420, marginTop:20 }}>
          <label>
            New email
            <input
              type="email"
              placeholder="you@newmail.com"
              value={newEmail}
              onChange={e=>setNewEmail(e.target.value)}
              style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #ddd', marginTop:6 }}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !newEmail}
            style={{ padding:'10px 14px', borderRadius:10, border:'none', background:'#2A9D8F', color:'#fff', fontWeight:700, cursor: busy?'not-allowed':'pointer' }}
          >
            {busy ? 'Working…' : 'Change email'}
          </button>
        </form>

        {/* Quick Actions */}
        <div style={{ display:'flex', gap:12, marginTop:20, flexWrap:'wrap' }}>
          <button
            onClick={signOut}
            disabled={busy}
            style={{ padding:'10px 14px', borderRadius:10, border:'1px solid #ddd', background:'#fff', cursor: busy?'not-allowed':'pointer' }}
          >
            Sign out
          </button>

          <button
            onClick={deleteAccount}
            disabled={busy}
            style={{ padding:'10px 14px', borderRadius:10, border:'none', background:'#E76F51', color:'#fff', fontWeight:700, cursor: busy?'not-allowed':'pointer' }}
          >
            Delete account
          </button>
        </div>

        {msg && <div style={{ marginTop:12, color: msg.includes('✅') ? '#2A9D8F' : '#C0392B' }}>{msg}</div>}
      </section>
    </div>
  )
}

