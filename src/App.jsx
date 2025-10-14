// src/App.jsx
import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import { ChatProvider } from './chat/ChatContext'  // ← NEW

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

// New (already in your imports, keeping it)
import ConnectionToast from './components/ConnectionToast'
// NEW: QR route to create a connection request
import Connect from './routes/Connect'

/** --------------------------
 * Home (hero + features + CTA)
 * ------------------------- */
function Home({ me }) {
  const authed = !!me?.id

  return (
    <div style={{ background: '#fff' }}>
      {/* HERO */}
      <section style={{ padding: '52px 0 36px', borderBottom: '1px solid var(--border)' }}>
        <div
          className="container"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 18,
            textAlign: 'center',
            maxWidth: 920
          }}
        >
          <h1
            style={{
              fontWeight: 900,
              fontSize: 44,
              lineHeight: 1.1,
              margin: '0 auto'
            }}
          >
            Welcome to{' '}
            <span style={{ color: '#0f766e' }}>Try</span>
            <span style={{ color: '#0f766e' }}>Me</span>
            <span style={{ color: '#f43f5e' }}>Dating</span>
          </h1>

          <p className="muted" style={{ margin: '0 auto', maxWidth: 760, fontSize: 16 }}>
            Meet intentionally. Share your invite with a QR code and connect only with people
            you’ve actually met. No endless swiping—just real conversations with people you trust.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: 4
            }}
          >
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

          <div
            style={{
              display: 'flex',
              gap: 16,
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginTop: 8
            }}
          >
            <div className="helper-muted">Private 1:1 messages</div>
            <div className="helper-muted">You control who can find you</div>
            <div className="helper-muted">No public browsing of strangers</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ padding: '28px 0' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <h2 style={{ fontWeight: 800, marginBottom: 14, textAlign: 'center' }}>How it works</h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16
            }}
          >
            <FeatureCard
              title="Create"
              text="Set up a simple profile with your name and a short intro. Choose if it’s public."
              icon="🧩"
            />
            <FeatureCard
              title="Share"
              text="Show your personal QR code to people you’ve met in real life to invite them."
              icon="🔗"
            />
            <FeatureCard
              title="Match"
              text="You both must accept—this isn’t a browse-everyone app; it’s about real connections."
              icon="🤝"
            />
            <FeatureCard
              title="Message"
              text="Keep it private and focused with clean, simple 1:1 messaging (no noise, no spam)."
              icon="💬"
            />
          </div>
        </div>
      </section>

      {/* SAFETY / PRIVACY STRIP */}
      <section
        style={{
          padding: '18px 0',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          background: '#fbfbfb'
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            flexWrap: 'wrap',
            textAlign: 'center'
          }}
        >
          <span style={{ fontWeight: 700 }}>Your pace. Your privacy.</span>
          <span className="muted">Turn public off anytime • Block/report if needed • No public search</span>
        </div>
      </section>

      {/* GET STARTED */}
      <section style={{ padding: '28px 0' }}>
        <div
          className="container"
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}
        >
          {!authed ? (
            <>
              <div className="muted">Ready to begin?</div>
              <Link className="btn btn-primary" to="/auth">Get started</Link>
            </>
          ) : (
            <>
              <div className="muted">Continue where you left off:</div>
              <Link className="btn btn-primary" to="/profile">Edit Profile</Link>
              <Link className="btn btn-neutral" to="/settings">Review Settings</Link>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

/** Presentational card for features */
function FeatureCard({ title, text, icon }) {
  return (
    <div
      className="card"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            background: '#f8fafc',
            border: '1px solid var(--border)',
            fontSize: 16
          }}
          aria-hidden
        >
          <span>{icon}</span>
        </div>
        <div style={{ fontWeight: 800 }}>{title}</div>
      </div>
      <div className="muted" style={{ lineHeight: 1.55 }}>{text}</div>
    </div>
  )
}

/** --------------------------
 * App Root
 * ------------------------- */
export default function App() {
  const [me, setMe] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  // unread count for messaging badge (used by Header via ChatLauncher)
  const [unread, setUnread] = useState(0)

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

  return (
    <ChatProvider renderDock={false}>
      <Header me={me} unread={unread} onSignOut={handleSignOut} />

      {/* NEW: global toast for inbound connection requests (Accept/Reject) */}
      {me?.id && <ConnectionToast me={me} />}

      <main style={{ minHeight: '60vh' }}>
        {!loadingAuth && (
          <Routes>
            <Route path="/" element={<Home me={me} />} />

            {/* Auth */}
            <Route path="/auth" element={<AuthPage />} />

            {/* Private routes (basic guard) */}
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

            {/* NEW: QR scan route to create a pending connection request */}
            <Route path="/connect" element={<Connect me={me} />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>

      <Footer />

      {/* Bottom-right chat bubble (render once).
          It should already listen for open events and track unread internally. */}
      <ChatLauncher onUnreadChange={(n) => setUnread(typeof n === 'number' ? n : unread)} />
    </ChatProvider>
  )
}




















