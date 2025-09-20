import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function SettingsPage(){
  const [user, setUser] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null))
  }, [])

  if (!supabase) {
    return (
      <div style={{padding:40}}>
        <h2>Settings</h2>
        <p>Supabase is not configured. Add env vars and redeploy.</p>
      </div>
    )
  }

  async function signOut(){
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  async function deleteAccountCompletely(){
    if (!user) return
    if (!confirm('Delete your account permanently? This cannot be undone.')) return
    setBusy(true); setMsg('')
    // Get current access token
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setBusy(false); setMsg('No active session'); return }

    try {
      const res = await fetch('/.netlify/functions/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({}) // we don't need to send user_id; server derives it from token
      })
      if (res.ok) {
        // Best-effort local signout; token may already be invalid
        await supabase.auth.signOut()
        alert('Your account has been deleted.')
        window.location.href = '/'
      } else {
        const text = await res.text()
        setMsg(`Failed to delete account: ${text}`)
      }
    } catch (e) {
      setMsg(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: 'ui-sans-serif, system-ui', maxWidth: 720 }}>
      <h2>Settings</h2>

      {!user ? (
        <div style={{ marginTop: 16 }}>Please sign in to manage your settings. <a href="/auth">Go to Auth</a></div>
      ) : (
        <>
          <div style={{ marginTop: 16 }}>
            <div style={{ opacity: .8 }}>
              <div><strong>Signed in as:</strong> {user.email}</div>
              <div style={{ fontSize: 13, opacity: .8 }}>User ID: {user.id}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={signOut} disabled={busy} style={{ padding: '10px 14px' }}>Sign out</button>
            </div>
          </div>

          <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginTop: 20 }}>
            <h3 style={{ margin: 0 }}>Danger zone</h3>
            <p style={{ opacity: .8 }}>This action is permanent and removes your account and profile.</p>
            <button
              onClick={deleteAccountCompletely}
              disabled={busy}
              style={{
                padding: '10px 14px',
                background: '#fff',
                border: '2px solid #E03A3A',
                color: '#E03A3A',
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              Delete account permanently
            </button>
          </div>
        </>
      )}

      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  )
}
