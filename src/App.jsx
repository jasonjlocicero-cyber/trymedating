import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import ChatDock from './components/ChatDock'
import MessageLauncher from './components/MessageLauncher'

// --- Pages ---
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import PublicProfile from './pages/PublicProfile'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Contact from './pages/Contact'

// --- Home page with on-brand hero ---
function Home() {
  return (
    <section style={{
      padding: '80px 16px',
      textAlign: 'center',
      background: 'linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 100%)'
    }}>
      <div className="container" style={{ maxWidth: 720 }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 16 }}>
          Welcome to{' '}
          <span style={{ fontWeight: 800, color: 'var(--secondary)' }}>TryMe</span>
          <span style={{ fontWeight: 800, color: 'var(--primary)' }}>Dating</span>
        </h1>

        <p style={{ fontSize: '1.25rem', marginBottom: 32, color: 'var(--muted)' }}>
          Meet new people, create real connections, and find the right match for you.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" style={{ minWidth: 140 }} to="/auth">
            Sign Up Free
          </Link>
          <Link className="btn btn-secondary" style={{ minWidth: 140 }} to="/auth">
            Sign In
          </Link>
        </div>
      </div>
    </section>
  )
}

export default function App() {
  return (
    <>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid #eee',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: 'color-mix(in oklab, var(--bg), #fff 20%)',
        backdropFilter: 'saturate(1.2) blur(6px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Brand title with split colors */}
          <Link to="/" style={{
            fontWeight: 800,
            textDecoration: 'none',
            fontSize: '1.25rem',
            lineHeight: 1
          }}>
            <span style={{ color: 'var(--secondary)' }}>TryMe</span>
            <span style={{ color: 'var(--primary)' }}>Dating</span>
          </Link>

          <nav style={{ display: 'flex', gap: 10 }}>
            <Link to="/profile">Profile</Link>
            <Link to="/settings">Settings</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/contact">Contact</Link>
          </nav>
        </div>
      </header>

      {/* Routes */}
      <main style={{ minHeight: 'calc(100vh - 160px)' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Public profile route */}
          <Route path="/u/:handle" element={<PublicProfile />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/contact" element={<Contact />} />
          {/* 404 fallback */}
          <Route path="*" element={
            <div className="container" style={{ padding: '32px 0' }}>
              <h2>Page not found</h2>
              <p><Link to="/">Go home</Link></p>
            </div>
          } />
        </Routes>
      </main>

      {/* Footer with split-color brand and quick links */}
      <footer style={{
        borderTop: '1px solid #eee',
        padding: '20px 16px'
      }}>
        <div className="container" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap'
        }}>
          <div style={{ fontWeight: 800 }}>
            <span style={{ color: 'var(--secondary)' }}>TryMe</span>
            <span style={{ color: 'var(--primary)' }}>Dating</span> &nbsp;© {new Date().getFullYear()}
          </div>
          <nav style={{ display: 'flex', gap: 12 }}>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/contact">Contact</Link>
          </nav>
        </div>
      </footer>

      {/* Floating messages launcher + chat dock (available on all pages) */}
      <MessageLauncher />
      <ChatDock />
    </>
  )
}







