import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Handles Supabase password recovery links.
 * Supabase sends users back with URL hash like:
 *   #access_token=...&type=recovery&expires_in=3600&refresh_token=...
 * This page detects that, and lets the user set a new password.
 */
export default function ResetPassword() {
  const [hasRecovery, setHasRecovery] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { document.title = 'Reset Password • TryMeDating' }, [])

  useEffect(() => {
    // Check the URL hash for type=recovery (Supabase v2)
    const hash = window.location.hash || ''
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
    const type = params.get('type')
    setHasRecovery(type === 'recovery')
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!pw || pw.length < 8) {
      setMsg('Password must be at least 8 characters.')
      return
    }
    setBusy(true); setMsg('')
    try {
      // At this point Supabase has already established a session from the recovery link.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setMsg('Recovery session not found. Try the link again.')
        setBusy(false)
        return
      }
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      setMsg('Password updated ✅ Redirecting to your profile…')
      setTimeout(() => { window.location.href = '/profile' }, 800)
    } catch (err) {
      setMsg(err.message || 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  if (!supabase) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Reset Password</h2>
        <p>Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 40, maxWidth: 520, fontFamily:'ui-sans-serif, system-ui' }}>
      <h2>Reset your password</h2>
      {!hasRecovery && (
        <p style={{ opacity:.8, marginTop:6 }}>
          Open this page using the password reset link from your email (it contains <code>type=recovery</code>).
        </p>
      )}

      <form onSubmit={submit} style={{ display:'grid', gap:12, marginTop:16 }}>
        <label>
          New password
          <input
            type="password"
            value={pw}
            onChange={e=>setPw(e.target.value)}
            placeholder="At least 8 characters"
            style={{ width:'100%', padding:12, borderRadius:10, border:'1px solid #ddd', marginTop:6 }}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !pw}
          style={{ padding:'10px 14px', borderRadius:10, border:'none', background:'#2A9D8F', color:'#fff', fontWeight:700, cursor: busy?'not-allowed':'pointer' }}
        >
          {busy ? 'Updating…' : 'Set new password'}
        </button>
      </form>

      {msg && <div style={{ marginTop:12, color: msg.includes('✅') ? '#2A9D8F' : '#C0392B' }}>{msg}</div>}
    </div>
  )
}
