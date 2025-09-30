// src/App.jsx
import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import PublicProfile from './pages/PublicProfile'
import SettingsPage from './pages/SettingsPage'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Contact from './pages/Contact'
import AdminReports from './pages/AdminReports'

export default function App() {
  const [me, setMe] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let sub = supabase.auth.onAuthStateChange(async (evt, session) => {
      if (session?.user) {
        setMe(session.user)
        // Fetch profile to check admin
        const { data } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('user_id', session.user.id)
          .maybeSingle()
        setIsAdmin(!!data?.is_admin)
      } else {
        setMe(null)
        setIsAdmin(false)
      }
    })
    return () => sub.data?.subscription?.unsubscribe()
  }, [])

  return (
    <Router>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Header */}
        <header style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
          <Link to="/" style={{ fontSize: 22, fontWeight: 800, textDecoration: 'none' }}>
            TryMeDating
          </Link>
        </header>

        {/* Main content */}
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<ProfilePage me={me} />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/profile" element={<ProfilePage me={me} />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/u/:handle" element={<PublicProfile />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/admin/reports" element={<AdminReports />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer style={{
          padding: '16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8
        }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link to="/terms" className="btn">Terms</Link>
            <Link to="/privacy" className="btn">Privacy</Link>
            <Link to="/contact" className="btn">Contact</Link>
            {isAdmin && (
              <Link to="/admin/reports" className="btn btn-secondary">Admin Reports</Link>
            )}
          </div>
        </footer>
      </div>
    </Router>
  )
}

















