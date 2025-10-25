// src/pages/AuthPage.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

/**
 * Email + password auth flows:
 * - Sign in
 * - Sign up (email confirmation supported)
 * - Forgot password (sends email)
 * - Reset password (after recovery link)
 *
 * Extras:
 * - `redirectTo` derives from VITE_SITE_URL (fallback to window.origin)
 * - Optional `?next=/path` to control post-auth landing
 * - Force session refresh after auth so the app reacts immediately
 */

export default function AuthPage() {
  const nav = useNavigate()
  const loc = useLocation()

  // For Netlify previews/production you can set VITE_SITE_URL in env; else fallback to current origin
  const siteUrl =
    (import.meta.env.VITE_SITE_URL && String(import.meta.env.VITE_SITE_URL)) ||
    window.location.origin
  const redirectTo = new URL('/auth', siteUrl).toString()

  // Allow /auth?next=/chat to control the landing page after auth
  const next =
    new URLSearchParams(loc.search).get('next') ||
    '/profile'

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  // When Supabase redirects back with a recovery link, it opens a temp session.
  // The auth listener will fire PASSWORD_RECOVERY and we show the reset form.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset')
        setMsg('Enter a new password to finish resetting your account.')
        setErr('')
        setPassword('')
        setConfirm('')
      }
    })
    return () => sub?.subscription?.unsubscribe?.()
  }, [])

  // If already signed in, go to next
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return
      if (user) nav(next, { replace: true })
    })()
    return () => { mounted = false }
  }, [nav, next])

  const title = useMemo(() => {
    switch (mode) {
      case 'signin': return 'Sign in'
      case 'signup': return 'Create account'
      case 'forgot': return 'Forgot password'
      case 'reset':  return 'Set a new password'
      default: return 'Account'
    }
  }, [mode])

  function switchMode(m: 'signin' | 'signup' | 'forgot' | 'reset') {
    setMode(m)
    setErr('')
    setMsg('')
  }

  async function doSignIn(e) {
    e.preventDefault()
    setErr(''); setMsg(''); setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      // Force the session/user to be available immediately
      await supabase.auth.getUser()
      nav(next, { replace: true })
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
        options: { emailRedirectTo: redirectTo }
      })
      if (error) throw error

      if (data.user && !data.session) {
        // Email confirmations ON
        setMsg('Check your email to confirm your account.')
        switchMode('signin')
      } else {
        // Auto-confirm enabled or got session
        await supabase.auth.getUser()
        nav(next, { replace: true })
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
        redirectTo
      })
      if (error) throw error
      setMsg('Password reset email sent. Check your inbox.')
      switchMode('signin')
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
      await supabase.auth.getUser()
      setMsg('Password updated — you are signed in.')
      nav(next, { replace: true })
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

      {err && <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>}

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
            <button type="button" className="btn btn-neutral" onClick={() => switchMode('forgot')}>
              Forgot password
            </button>
            <button





