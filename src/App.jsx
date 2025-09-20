import React, { Suspense, lazy } from 'react'
import { Routes, Route, Link } from 'react-router-dom'

// Lazy imports (pages must exist under src/pages/)
const AuthPage = lazy(() => import('./pages/AuthPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const PublicProfile = lazy(() => import('./pages/PublicProfile'))

function Home() {
  return (
    <div style={{ padding: 40, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1>TryMeDating — Home</h1>
      <p>If you can see this, routing and rendering are working 🎉</p>

      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <Link className="btn btn-primary" to="/auth">Auth</Link>
        <Link className="btn btn-secondary" to="/profile">Profile</Link>
        <Link className="btn btn-ghost" to="/settings">Settings</Link>
        <Link className="btn" to="/u/test">Public Profile</Link>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
      <Routes>
        {/* Home */}
        <Route path="/" element={<Home />} />

        {/* Auth / Profile / Settings */}
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Public profile page */}
        <Route path="/u/:handle" element={<PublicProfile />} />
      </Routes>
    </Suspense>
  )
}
