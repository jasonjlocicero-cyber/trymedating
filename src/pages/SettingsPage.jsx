import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function SettingsPage() {
  const [user, setUser] = useState(null)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

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

  async function changePassword(e) {
    e.preventDefault()
    if (!pw || pw.length < 8) {
      setMsg('Password must be at least 8 characters.')
      return
    }
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    setPw('')
    setMsg(error ? error.message : 'Password updated ✅')
  }

  async function signOut() {
    setBusy(true); setMsg('')
    await supabase.auth.signOut()
    setBusy(false)
    window.location.href = '/auth'
  }

  async function deleteAccount() {
    if (!user) return
    const sure = confirm('This permanently deletes your account and profile. Continue?')
    if (!sure) return
    setBusy(true); setMsg('Deleting account…')

    // Get current session access token to prove identity to the function
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

      // Clear local session after server-side delete
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
        <div style={{ opacity:.8, fontSize:14, marginBottom:12 }}>Signed in as: {user?.email}</div>

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

        <div style={{ display:'flex', gap:12, marginTop:20 }}>
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

        {msg && <div style={{ marginTop:12, color:'#C0392B' }}>{msg}</div>}
      </section>
    </div>
  )
}
