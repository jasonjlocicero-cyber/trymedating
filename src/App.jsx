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

// Branded Home (restored hero + CTAs)
function Home({ me }) {
  const authed = !!me?.id
  return (
    <div style={{ background: '#ffffff' }}>
      {/* Hero */}
      <section
        style={{
          padding: '48px 0',
          borderBottom: '1px solid var(--border)',
          background:
            'radial-gradient(1200px 320px at 10% -10%, rgba(20,184,166,0.08), transparent 60%), radial-gradient(900px 300px at 90% -20%, rgba(244,63,94,0.08), transparent 60%)'
        }}
      >
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
          <h1 style={{ fontWeight: 900, fontSize: 36, lineHeight: 1.1, margin: 0 }}>
            Welcome to <span style={{ color: '#0f766e' }}>Try</span>
            <span style={{ color: '#f43f5e' }}>Me</span>
            <span style={{ color: '#f43f5e' }}>Dating</span>
          </h1>

          <p className="muted" style={{ maxWidth: 720, fontSize: 16 }}>
            Meet intentionally. Share your invite via QR, match with people you’ve already met,
            and keep conversations private and simple.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {!authed ? (
              <>
                <Link className="btn btn-primary" to="/auth">Sign in / Sign up</Link>
                <a className="btn btn-neutral" href="#how-it-works">How it works</a>
              </>
            ) : (
              <>
                <Link className="btn btn-primary" to="/profile">Go to Profile</Link>
                <Link className="btn btn-secondary" to="/settings">Settings</Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Quick features */}
      <section id="how-it-works" style={{ padding: '28px 0' }}>
        <div className="container" style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ fontWeight: 800, marginBottom: 4 }}>How it works</h2>
          <ul style={{ margin: 0, paddingLeft: 18, maxWidth: 820, lineHeight: 1.6 }}>
            <li><strong>Create</strong> a simple profile and choose if it’s public.</li>
            <li><strong>Share</strong> your personal QR code with people you meet.</li>
            <li><strong>Match</strong> once both of you accept—no browsing strangers.</li>
            <li><strong>Message</strong> privately with a clean, focused chat.</li>
          </ul>
        </div>
      </section>

      {/* Get started */}
      <section style={{ padding: '28px 0', borderTop: '1px solid var(--border)' }}>
        <div className="container" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {!authed ? (
            <>
              <div className="muted">Ready to begin?</div>
              <Link className="btn btn-primary" to="/auth">Get started</Link>
            </>
          ) : (
            <>
              <div className="muted">All set?</div>
              <Link className="btn btn-primary" to="/profile">Edit Profile</Link>
              <Link className="btn btn-neutral" to="/settings">Review Settings</Link>
            </>
          )}
        </div>
      </section>
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

            {/* Auth */}
            <Route path="/auth" element={<AuthPage />} />

            {/* Private */}
            <Route path="/profile" element={me ? <ProfilePage /> : <Navigate to="/auth" replace />} />
            <Route path="/settings" element={me ? <SettingsPage /> : <Navigate to="/auth" replace />} />

            {/* Public */}
            <Route path="/u/:handle" element={<PublicProfile />} />

            {/* Static */}
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>

      <Footer />

      {/* Bottom-right 💬 launcher */}
      <ChatLauncher />
    </>
  )
}



















