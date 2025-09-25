// src/pages/AuthPage.jsx
import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

/**
 * AuthPage
 * Modes:
 *  - signIn: email + password
 *  - signUp: email + password (creates account)
 *  - reset: request reset email; if session is in "recovery" state, let user set a new password
 *
 * Notes:
 *  - Make sure Supabase Auth > Email provider is enabled in your dashboard.
 *  - Settings > Auth > URL configuration: set "Site URL" to your Netlify domain so password reset links return here.
 */

export default function AuthPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const next = params.get('next') || '/profile'
  const urlMode = params.get('mode') // when returning from a password reset link, Supabase may open a recovery session

  const [mode, setMode] = useState(urlMode === 'reset' ? 'reset' : 'signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [isRecovery, setIsRecovery] = useState(false) // true when user arrived via password recovery link

  // If already signed in, go to next
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!alive) return
      if (session?.user) {
        navigate(next, { replace: true })
      }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) navigate(next, { replace: true })
      // Supabase sets event === 'PASSWORD_RECOVERY' when coming from reset link
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset')
        setIsRecovery(true)
        setNotice('Enter a new password for your account.')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [navigate, next])

  async function onSignIn(e) {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message)
  }

  async function onSignUp(e) {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    if (password.length < 6) {
      setBusy(false)
      setError('Password must be at least 6 characters.')
      return
    }
    const { error } = await supabase.auth.signUp({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message)
    else setNotice('Account created. Please check your email to confirm (if required), then sign in.')
  }

  async function onSendReset(e) {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      const redirectTo = `${window.location.origin}/auth?mode=reset`
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      setBusy(false)
      if (error) setError(error.message)
      else setNotice('Reset email sent. Check your inbox for the link.')
    } catch (err) {
      setBusy(false)
      setError(err.message || 'Could not send reset email.')
    }
  }

  async function onUpdatePassword(e) {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    if (password.length < 6) {
      setBusy(false)
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== password2) {
      setBusy(false)
      setError('Passwords do not match.')
      return
    }
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setNotice('Password updated. You are signed in.')
      // small delay, then go to next
      setTimeout(() => navigate(next, { replace: true }), 800)
    }
  }

  function HeaderTitle() {
    return (
      <h1 style={{ marginBottom: 12, textAlign: 'center' }}>
        <span style={{ color: 'var(--secondary)' }}>Account</span>{' '}
        <span style={{ color: 'var(--primary)' }}>Access</span>
      </h1>
    )
  }

  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 520 }}>
      <HeaderTitle />

      {(notice || error) && (
        <div className="card" style={{ borderColor: notice ? 'var(--secondary)' : '#e11d48', color: notice ? 'var(--secondary)' : '#e11d48' }}>
          {notice || error}
        </div>
      )}

      {/* SIGN IN */}
      {mode === 'signIn' && (
        <form className="card" onSubmit={onSignIn} style={{ display:'grid', gap: 12 }}>
          <label style={{ fontWeight: 700 }}>Email</label>
          <input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required />

          <label style={{ fontWeight: 700 }}>Password</label>
          <input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required />

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>

          <div style={{ display:'flex', justifyContent:'space-between', fontSize: 14 }}>
            <button type="button" className="btn" onClick={()=>{ setMode('signUp'); setError(''); setNotice('') }}>
              Create account
            </button>
            <button type="button" className="btn" onClick={()=>{ setMode('reset'); setError(''); setNotice('') }}>
              Forgot password?
            </button>
          </div>
        </form>
      )}

      {/* SIGN UP */}
      {mode === 'signUp' && (
        <form className="card" onSubmit={onSignUp} style={{ display:'grid', gap: 12 }}>
          <label style={{ fontWeight: 700 }}>Email</label>
          <input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required />

          <label style={{ fontWeight: 700 }}>Password</label>
          <input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required />

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>

          <div style={{ textAlign:'center', fontSize: 14 }}>
            Already have an account?{' '}
            <button type="button" className="btn" onClick={()=>{ setMode('signIn'); setError(''); setNotice('') }}>
              Sign in
            </button>
          </div>
        </form>
      )}

      {/* RESET (request or complete) */}
      {mode === 'reset' && (
        <>
          {!isRecovery ? (
            // Phase 1: request reset email
            <form className="card" onSubmit={onSendReset} style={{ display:'grid', gap: 12 }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>Reset your password</div>
              <label style={{ fontWeight: 700 }}>Email</label>
              <input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required />
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset email'}
              </button>

              <div style={{ textAlign:'center', fontSize: 14 }}>
                <button type="button" className="btn" onClick={()=>{ setMode('signIn'); setError(''); setNotice('') }}>
                  Back to sign in
                </button>
              </div>
            </form>
          ) : (
            // Phase 2: user came from reset link -> set new password
            <form className="card" onSubmit={onUpdatePassword} style={{ display:'grid', gap: 12 }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>Set a new password</div>
              <label style={{ fontWeight: 700 }}>New password</label>
              <input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required />
              <label style={{ fontWeight: 700 }}>Confirm new password</label>
              <input type="password" autoComplete="new-password" value={password2} onChange={e=>setPassword2(e.target.value)} required />
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Updating…' : 'Update password'}
              </button>
              <div style={{ textAlign:'center', fontSize: 14 }}>
                <Link to="/">Go home</Link>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  )
}



