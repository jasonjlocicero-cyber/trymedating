// src/App.jsx
import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'

// Layout
import Header from './components/Header'
import Footer from './components/Footer'
import ChatLauncher from './components/ChatLauncher'

// Pages
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import PublicProfile from './pages/PublicProfile'
import Contact from './pages/Contact'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'

// Restored simple Hero Home
function Home({ me }) {
  const authed = !!me?.id
  return (
    <div className="container" style={{ padding: '48px 0', textAlign: 'center' }}>
      <h1 style={{ fontWeight: 900, fontSize: 40, marginBottom: 16 }}>
        Welcome to{' '}
        <span style={{ color: '#0f766e' }}>Try</span>
        <span style={{ color: '#f43f5e' }}>Me</span>
        <span style={{ color: '#f43f5e' }}>Dating</span>
      </h1>
      <p className="muted" style={{ maxWidth: 640, margin: '0 auto 24px' }}>
        Meet intentionally. Share your invite with a QR code, and connect only with people you’ve
        met in real life.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        {!authed ? (
          <>
            <Link className="btn btn-primary" to="/auth">Sign in / Sign up</Link>
            <Link className="btn btn-neutral" to="/contact">Learn more</Link>
          </>
        ) : (
          <>
            <Link className="btn btn-primary" to="/profile">Go to Profile</Link>
            <Link className="btn btn-secondary" to="/settings">Settings</Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [me, setMe] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  useEffect(() => {
    let mounted = true
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return
      setMe(user || null)
      setLoadingAuth(false)
    }
    loadUser()
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null)
    })
    return () => {
      mounted = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const unread = 0

  return (
    <>
      <Header me={me} unread={unread} onSignOut={handleSignOut} />

      <main style={{ minHeight: '60vh' }}>
        {!loadingAuth && (
          <Routes>
            <Route path="/" element={<Home me={me} />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/profile" element={me ? <ProfilePage /> : <Navigate to="/auth" replace />} />
            <Route path="/settings" element={me ? <SettingsPage /> : <Navigate to="/auth" replace />} />
            <Route path="/u/:handle" element={<PublicProfile />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>

      <Footer />
      <ChatLauncher />
    </>
  )
}




















