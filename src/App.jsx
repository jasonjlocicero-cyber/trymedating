import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import ChatDock from './components/ChatDock'

// --- Pages ---
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import PublicProfile from './pages/PublicProfile'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Contact from './pages/Contact'

// --- Home ---
function Home() {
  return (
    <div className="container" style={{ padding: '32px 0' }}>
      <h1>TryMeDating</h1>
      <p>Welcome! Messaging dock is mounted globally.</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <Link className="btn btn-primary" to="/auth">Sign in</Link>
        <Link className="btn btn-secondary" to="/profile">My Profile</Link>
        <Link className="btn" to="/settings">Settings</Link>
      </div>
    </div>
  )
}

// --- App Layout + Routes ---
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
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/" style={{ fontWeight: 800, textDecoration: 'none', color: '#2A2A2A' }}>
            TryMeDating
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
      <main style={{ minHeight: 'calc(100vh - 140px)' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/u/:handle" element={<PublicProfile />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/contact" element={<Contact />} />
          {/* 404 Fallback */}
          <Route path="*" element={
            <div className="container" style={{ padding: '32px 0' }}>
              <h2>Page not found</h2>
              <p><Link to="/">Go home</Link></p>
            </div>
          } />
        </Routes>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #eee', padding: '16px', textAlign: 'center' }}>
        © {new Date().getFullYear()} TryMeDating
      </footer>

      {/* 🔽 ChatDock mounted globally */}
      <ChatDock />
    </>
  )
}
