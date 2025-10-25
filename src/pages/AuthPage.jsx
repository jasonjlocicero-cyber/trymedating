// src/pages/AuthPage.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

/**
 * Email+password auth with:
 * - Sign in
 * - Sign up (with email confirmation if enabled)
 * - Forgot password (sends reset email)
 * - Password recovery flow (Supabase opens a temp session; we show "reset" form)
 * Hardens redirects + handles SIGNED_IN/USER_UPDATED events to auto-navigate.
 */

export default function AuthPage() {
  const nav = useNavigate()
  const loc = useLocation()

  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'forgot' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  // Where Supabase should redirect back after email-confirm / password-reset links
  const redirectTo = `${window.location.origin}/auth`

  // Detect Supabase auth events (recovery + signed in after redirects)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset')
        setMsg('Enter a new password to finish resetting your account.')
        setErr('')
        setPassword('')
        setConfirm('')
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // If a magic link/confirmation just created a session, go to profile
        nav('/profile', { replace: true })
      }
    })
    return () => sub?.subscription?.unsubscribe?.()
  }, [nav])

  // If already signed in when visiting /auth, go to profile
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return
      if (user) nav('/profile', { replace: true })
    })()
    return () => { mounted = false }
  }, [nav])

  // Optional: support URL hints like /auth?mode=signup
  useEffect(() => {
    const q = new URLSearchParams(loc.search)
    const m = q.get('mode')
    if (m && ['signin','signup','forgot','reset'].includes(m)) {
      setMode(m)
    }
  }, [loc.search])

  const title = useMemo(() => {
    switch (mode) {
      case 'signin': return 'Sign in'
      case 'signup': return 'Create account'
      case 'forgot': return 'Forgot password'
      case 'reset':  return 'Set a new password'
      default: return 'Account'
    }
  }, [mode])

  async function doSignIn(e) {
    e.preventDefault()
    setErr(''); setMsg(''); setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      // Ensure session is fresh, then navigate
      await supabase.auth.getUser()
      setMsg('Signed in — redirecting…')
      nav('/profile', { replace: true })
    } catch (e) {
      setErr(e.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  async function doSignUp(e) {
    e.preventDefault()
    setErr(''); setMsg(''); setLoading(true)
    try {
      if (!email || !password) throw new Error('Email and password are required')
      if (password !== confirm) throw new Error('Passwords do not match')

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo, // ensures return to /auth after confirm
          // shouldCreateUser: true (default)
        }
      })
      if (error) throw error

      if (data.user && !data.session) {
        // Email confirmations ON
        setMsg('Check your email to confirm your account.')
        setMode('signin')
      } else {
        // Confirmations OFF -> signed in immediately
        setMsg('Account created — redirecting…')
        nav('/profile', { replace: true })
      }
    } catch (e) {
      setErr(e.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  async function doForgot(e) {
    e.preventDefault()
    setErr(''); setMsg(''); setLoading(true)
    try {
      if (!email) throw new Error('Enter your account email first')
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo, // return to /auth; listener will switch to reset mode
      })
      if (error) throw error
      setMsg('Password reset email sent. Check your inbox.')
      setMode('signin')
    } catch (e) {
      setErr(e.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  async function doReset(e) {
    e.preventDefault()
    setErr(''); setMsg(''); setLoading(true)
    try {
      if (!password) throw new Error('Enter a new password')
      if (password !== confirm) throw new Error('Passwords do not match')
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMsg('Password updated — you are signed in.')
      nav('/profile', { replace: true })
    } catch (e) {
      setErr(e.message || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 560 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>{title}</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        {mode === 'signin' && 'Use your email and password to sign in.'}
        {mode === 'signup' && 'Create your account with an email and password.'}
        {mode === 'forgot' && 'We will email you a secure link to reset your password.'}
        {mode === 'reset'  && 'Choose a new password.'}
      </p>

      {err && (
        <div className="helper-error" style={{ marginBottom: 12 }}>
          {err}
        </div>
      )}
      {msg && (
        <div className="helper-success" style={{ marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* SIGN IN */}
      {mode === 'signin' && (
        <form onSubmit={doSignIn} style={{ display: 'grid', gap: 12 }}>
          <label className="form-label">
            Email
            <input
              type="email"
              className="input"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="form-label">
            Password
            <input
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={loading} type="submit">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="btn btn-neutral"
              onClick={() => { setMode('forgot'); setErr(''); setMsg('') }}
            >
              Forgot password
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setMode('signup'); setErr(''); setMsg('') }}
            >
              Create account
            </button>
          </div>
        </form>
      )}

      {/* SIGN UP */}
      {mode === 'signup' && (
        <form onSubmit={doSignUp} style={{ display: 'grid', gap: 12 }}>
          <label className="form-label">
            Email
            <input
              type="email"
              className="input"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="form-label">
            Password
            <input
              type="password"
              className="input"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          <label className="form-label">
            Confirm password
            <input
              type="password"
              className="input"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={loading} type="submit">
              {loading ? 'Creating…' : 'Create account'}
            </button>
            <button
              type="button"
              className="btn btn-neutral"
              onClick={() => { setMode('signin'); setErr(''); setMsg('') }}
            >
              Back to sign in
            </button>
          </div>
        </form>
      )}

      {/* FORGOT */}
      {mode === 'forgot' && (
        <form onSubmit={doForgot} style={{ display: 'grid', gap: 12 }}>
          <label className="form-label">
            Account email
            <input
              type="email"
              className="input"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </label>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={loading} type="submit">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              className="btn btn-neutral"
              onClick={() => { setMode('signin'); setErr(''); setMsg('') }}
            >
              Back to sign in
            </button>
          </div>
        </form>
      )}

      {/* RESET (after recovery link) */}
      {mode === 'reset' && (
        <form onSubmit={doReset} style={{ display: 'grid', gap: 12 }}>
          <label className="form-label">
            New password
            <input
              type="password"
              className="input"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          <label className="form-label">
            Confirm new password
            <input
              type="password"
              className="input"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={loading} type="submit">
              {loading ? 'Updating…' : 'Update password'}
            </button>
            <button
              type="button"
              className="btn btn-neutral"
              onClick={() => { setMode('signin'); setErr(''); setMsg('') }}
            >
              Back to sign in
            </button>
          </div>
        </form>
      )}

      <div style={{ marginTop: 24 }}>
        <Link className="btn btn-neutral" to="/">← Back to Home</Link>
      </div>
    </div>
  )
}






