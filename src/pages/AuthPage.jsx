// src/pages/AuthPage.jsx
import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { track } from '../lib/analytics'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setSending(true)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin }
      })

      if (error) {
        setError(error.message)
      } else {
        setNotice('Check your inbox for the magic link!')
        track('Auth Magic Link Sent') // ✅ track event
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSending(false)
    }
  }

  // Track sign-in after session established
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      track('Auth Signed In') // ✅ track event
    }
  })

  return (
    <div className="container" style={{ padding: '48px 0', maxWidth: 420 }}>
      <h1 style={{ marginTop: 0, marginBottom: 16 }}>Sign in</h1>
      <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: 12 }}>
        <label style={{ fontWeight: 700 }}>Email</label>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Send magic link'}
        </button>
      </form>

      {notice && (
        <div className="card" style={{ borderLeft: '4px solid var(--secondary)', marginTop: 12 }}>
          {notice}
        </div>
      )}
      {error && (
        <div className="card" style={{ borderLeft: '4px solid #e11d48', color: '#b91c1c', marginTop: 12 }}>
          {error}
        </div>
      )}
    </div>
  )
}




