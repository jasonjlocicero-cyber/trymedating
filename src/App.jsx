// src/App.jsx
import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'

// Layout
import Header from './components/Header'
import Footer from './components/Footer'
import ChatLauncher from './components/ChatLauncher'

// Pages (make sure these files exist; otherwise create simple placeholders)
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import PublicProfile from './pages/PublicProfile'
import Contact from './pages/Contact'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'

// Minimal Home (inline so we don't depend on a separate file)
function Home() {
  return (
    <div className="container" style={{ padding: '28px 0' }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Welcome to TryMeDating</h1>
      <p className="muted" style={{ maxWidth: 640 }}>
        Sign in to set up your profile, invite matches with your QR code, and start private 1:1
        messaging. Use the “Messages” button in the header or the 💬 bubble at the bottom-right.
      </p>
    </div>
  )
}

export default function App() {
  const [me, setMe] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  // Track auth user
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

  // You can feed an unread count into Header later if you want a badge
  const unread = 0

  return (
    <>
      <Header me={me} unread={unread} onSignOut={handleSignOut} />

      <main style={{ minHeight: '60vh' }}>
        {/* Small guard to avoid flicker on initial load */}
        {!loadingAuth && (
          <Routes>
            <Route path="/" element={<Home />} />

            {/* Auth */}
            <Route path="/auth" element={<AuthPage />} />

            {/* Private pages (basic guard) */}
            <Route
              path="/profile"
              element={me ? <ProfilePage /> : <Navigate to="/auth" replace />}
            />
            <Route
              path="/settings"
              element={me ? <SettingsPage /> : <Navigate to="/auth" replace />}
            />

            {/* Public profile */}
            <Route path="/u/:handle" element={<PublicProfile />} />

            {/* Static pages */}
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>

      <Footer />

      {/* Bottom-right 💬 launcher — render exactly once */}
      <ChatLauncher />
    </>
  )
}



















