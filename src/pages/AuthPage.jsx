import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AuthPage() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'magic'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const redirectTo = typeof window !== 'undefined' ? window.location.origin + '/profile' : undefined

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

  // If already signed in, go to /profile
  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return
      if (session) window.location.href = '/profile'
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) window.location.href = '/profile'
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  async function handleSignIn(e) {
    e.preventDefault()
    setMsg(''); setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg(error.message)
      // success triggers onAuthStateChange → redirects
    } catch (err) {
      setMsg(err.message || 'Sign-in failed.')
    } finally { setBusy(false) }
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setMsg(''); setBusy(true)
    try {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
      if (error) setMsg(error.message)
      else setMsg('Account created. Check your email if confirmations are on, then sign in.')
    } catch (err) {
      setMsg(err.message || 'Sign-up failed.')
    } finally { setBusy(false) }
  }

  async function sendMagic(e) {
    e.preventDefault()
    setMsg(''); setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
      if (error) setMsg(error.message)
      else setSent(true)
    } catch (err) {
      setMsg(err.message || 'Something went wrong.')
    } finally { setBusy(false) }
  }

  const Tab = ({ id, children }) => (
    <button
      onClick={() => { setMode(id); setMsg(''); setSent(false) }}
      style={{
        padding: '8px 12px',
        border: '1px solid #ddd',
        background: mode === id ? '#f6f6f6' : '#fff',
        borderRadius: 8,
        cursor: 'pointer'
      }}
    >
      {children}
    </button>
  )

  return (
    <div style={{ padding: 40, fontFamily: 'ui-sans-serif, system-ui', maxWidth: 520 }}>
      <h2>Welcome back</h2>
      <p style={{ opacity: .8, marginTop: 6 }}>Choose how you want to sign in.</p>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0 16px' }}>
        <Tab id="signin">Sign in</Tab>
        <Tab id="signup">Sign up</Tab>
        <Tab id="magic">Magic link</Tab>
      </div>

      {mode === 'signin' && (
        <form onSubmit={handleSignIn} style={{ display: 'grid', gap: 12 }}>
          <label>
            Email
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #ddd' }} />
          </label>
          <label>
            Password
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #ddd' }} />
          </label>
          <button type="submit" disabled={busy || !email || !password}
            style={{ padding:'10px 14px', borderRadius:10, border:'none', background:'#2A9D8F', color:'#fff', fontWeight:700, cursor: busy?'not-allowed':'pointer' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <small style={{ opacity:.7 }}>
            Forgot your password? <a href="#" onClick={async (e)=>{e.preventDefault(); setMsg('Sending reset email…'); const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo }); setMsg(error ? error.message : 'Check your email for the reset link.') }}>Reset it</a>.
          </small>
        </form>
      )}

      {mode === 'signup' && (
        <form onSubmit={handleSignUp} style={{ display: 'grid', gap: 12 }}>
          <label>
            Email
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #ddd' }} />
          </label>
          <label>
            Password
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #ddd' }} />
          </label>
          <button type="submit" disabled={busy || !email || !password}
            style={{ padding:'10px 14px', borderRadius:10, border:'none', background:'#2A9D8F', color:'#fff', fontWeight:700, cursor: busy?'not-allowed':'pointer' }}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <small style={{ opacity:.7 }}>
            Depending on settings, you may need to confirm your email once before first sign-in.
          </small>
        </form>
      )}

      {mode === 'magic' && (
        sent ? (
          <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 10, padding: 16 }}>
            Check your inbox for the magic link. Open it in the same browser for best results.
          </div>
        ) : (
          <form onSubmit={sendMagic} style={{ display: 'grid', gap: 12 }}>
            <label>
              Email
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #ddd' }} />
            </label>
            <button type="submit" disabled={busy || !email}
              style={{ padding:'10px 14px', borderRadius:10, border:'none', background:'#E76F51', color:'#fff', fontWeight:700, cursor: busy?'not-allowed':'pointer' }}>
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )
      )}

      {msg && <div style={{ color: '#C0392B', marginTop: 10 }}>{msg}</div>}
    </div>
  )
}


