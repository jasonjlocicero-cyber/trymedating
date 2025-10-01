// src/App.jsx
import React, { useEffect, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'

// Layout
import Header from './components/Header'
import Footer from './components/Footer'

// Pages (make sure these exist in your src/pages folder)
import Home from './pages/Home'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import PublicProfile from './pages/PublicProfile'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import Contact from './pages/Contact'

// Optional: a light messages placeholder so /messages won’t 404
function MessagesHub() {
  return (
    <div className="container" style={{ padding: 24 }}>
      <h1>Messages</h1>
      <p>This is a placeholder route. Use the Messages button (chat bubble) to open the in-page chat dock.</p>
    </div>
  )
}

export default function App() {
  const nav = useNavigate()
  const [me, setMe] = useState(null) // { id, email, is_admin? }

  // Load current user + minimal profile (is_admin)
  useEffect(() => {
    let unsub = () => {}

    async function bootstrap() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) {
        // fetch is_admin from profiles
        const { data: prof } = await supabase
          .from('profiles')
          .select('user_id, is_admin')
          .eq('user_id', user.id)
          .maybeSingle()
        setMe({ id: user.id, email: user.email, is_admin: !!prof?.is_admin })
      } else {
        setMe(null)
      }

      // listen for auth changes
      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
        const u = session?.user
        if (u?.id) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('user_id, is_admin')
            .eq('user_id', u.id)
            .maybeSingle()
          setMe({ id: u.id, email: u.email, is_admin: !!prof?.is_admin })
        } else {
          setMe(null)
        }
      })
      unsub = () => sub?.subscription?.unsubscribe()
    }

    bootstrap()
    return () => unsub()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setMe(null)
    nav('/')
  }

  return (
    <>
      {/* New, clean header (uses brand buttons) */}
      <Header me={me} onSignOut={handleSignOut} />

      {/* Main routes */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/profile" element={<ProfilePage me={me} />} />
        <Route path="/settings" element={<SettingsPage me={me} />} />
        <Route path="/messages" element={<MessagesHub />} />
        <Route path="/u/:handle" element={<PublicProfile />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/contact" element={<Contact />} />
        {/* Add other routes here as you create them */}
      </Routes>

      {/* Unified footer (uses brand buttons) */}
      <Footer />
    </>
  )
}

















