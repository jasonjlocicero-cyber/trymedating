// src/App.jsx
import React, { useEffect, useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'

import Home from './pages/Home'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import AuthPage from './pages/AuthPage'

export default function App() {
  const [me, setMe] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  // Initialize Supabase auth + subscribe to changes
  useEffect(() => {
    let unsub = () => {}
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setMe(user || null)
      } catch (e) {
        console.error('supabase auth init error:', e)
      } finally {
        setAuthReady(true)
      }

      const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
        setMe(session?.user || null)
      })
      unsub = () => sub.subscription.unsubscribe()
    })()
    return () => unsub()
  }, [])

  return (
    <div>
      <Header me={me} />
      <main>
        <Routes>
          <Route path="/" element={<Home me={me} />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<div className="container" style={{padding:24}}>Not found</div>} />
        </Routes>
      </main>
      <Footer />

      {!authReady && (
        <div className="container" style={{ padding: 8, fontSize: 12, color: 'var(--muted)' }}>
          Initializing…
        </div>
      )}
    </div>
  )
}

function Header({ me }) {
  const nav = useNavigate()
  const authed = !!me?.id

  async function handleSignOut() {
    try { await supabase.auth.signOut() } catch {}
    nav('/') // send back home after sign-out
  }

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="brand">TryMeDating</Link>
        <nav className="nav">
          <Link to="/" className="nav-link">Home</Link>
          <a className="nav-link" href="mailto:support@trymedating.com">Contact</a>
          {authed ? (
            <button className="btn" onClick={handleSignOut}>Sign out</button>
          ) : (
            <Link to="/auth" className="btn btn-primary">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container" style={{ padding: '14px 0' }}>
        <div className="footer-links">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <a href="mailto:support@trymedating.com">Contact</a>
        </div>
      </div>
    </footer>
  )
}
















