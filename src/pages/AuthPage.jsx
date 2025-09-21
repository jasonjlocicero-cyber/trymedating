import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // If Supabase isn't configured, show a friendly message
  if (!supabase) {
    return (
      <div style={{ padding: 40, fontFamily: 'ui-sans-serif, system-ui' }}>
        <h2>Sign in / Sign up</h2>
        <p>
          Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> to Netlify Environment variables and redeploy.
        </p>
      </div>
    )
  }

  // If already signed in, send to /profile
  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return
      if (session) window.location.href = '/profile'
    })
    return () => { alive = false }
  }, [])

  // Also react to OAuth/magic-link callbacks that finalize the session on load
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) window.location.href = '/profile'
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  async function sendLink(e) {
    e.preventDefault()
    setMsg('')
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // After clicking the email, user lands here
          emailRedirectTo: window.location.origin + '/profile'
        }
      })
      if (error) setMsg(error.message)
      else setSent(true)
    } catch (err) {
      setMsg(err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: 'ui-sans-serif, system-ui', maxWidth: 520 }}>
      <h2>Sign in / Sign up</h2>
      <p style={{ opacity: .8, marginTop: 6 }}>
        We’ll send a secure sign-in link to your email. No password needed.
      </p>

      {sent ? (
        <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 10, padding: 16 }}>
          Check your inbox for the magic link. Open it in the same browser for best results.
        </div>
      ) : (
        <form onSubmit={sendLink} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <label>
            <span style={{ display: 'block', marginBottom: 6 }}>Email</span>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: '1px solid #ddd',
                fontSize: 16
              }}
            />
          </label>

          <button
            type="submit"
            disabled={busy || !email}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              background: '#007A7A',
              color: '#fff',
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            {busy ? 'Sending…' : 'Send Sign-in Link'}
          </button>

          {msg && (
            <div style={{ color: '#C0392B', marginTop: 4 }}>
              {msg}
            </div>
          )}

          <div style={{ fontSize: 13, opacity: .7, marginTop: 6 }}>
            Tip: In Supabase &rarr; Settings &rarr; Authentication &rarr; <b>URL Configuration</b>, ensure
            your Site URL and Additional Redirect URLs include your domain(s).
          </div>
        </form>
      )}
    </div>
  )
}

