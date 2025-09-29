// src/pages/AuthPage.jsx
import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setStatus('')
    try {
      const { error } = await supabase.auth.signInWithOtp({ email })
      if (error) throw error
      setStatus('Check your email for the sign-in link.')
      setEmail('')
    } catch (err) {
      setStatus(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 420 }}>
      <h1>Sign in / Sign up</h1>
      <p className="muted">Enter your email and we’ll send you a magic link.</p>
      <form onSubmit={handleLogin} style={{ display: 'grid', gap: 12 }}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Sending…' : 'Send Sign-in Link'}
        </button>
      </form>
      {status && (
        <div style={{ marginTop: 12, fontSize: 14 }}>
          {status}
        </div>
      )}
    </div>
  )
}




