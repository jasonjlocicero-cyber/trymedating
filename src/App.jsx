import React, { Suspense, useEffect, useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'

// Pages
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import PublicProfile from './pages/PublicProfile'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Contact from './pages/Contact'
import Explore from './pages/Explore'
import ResetPassword from './pages/ResetPassword'
import Likes from './pages/Likes'
import Messages from './pages/Messages'

// Simple color constants
const C = { ink: '#222', coral: '#E76F51', teal: '#2A9D8F' }

// Home page
function Home() {
  const nav = useNavigate()
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 48, marginBottom: 20 }}>Welcome to TryMeDating</h1>
      <p style={{ fontSize: 20, opacity: 0.8 }}>A warmer approach to meeting new people.</p>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 24 }}>
        <button onClick={() => nav('/profile')} style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: C.teal, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          Go to your Profile
        </button>
        <button onClick={() => nav('/auth')} style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: C.coral, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          Sign up / Log in
        </button>
      </div>
    </div>
  )
}

// Top navigation bar (with auth-aware right side)
function NavBar() {
  const nav = useNavigate()
  const [user, setUser] = useState(null)
  const [avatar, setAvatar] = useState('')

  useEffect(() => {
    let alive = true
    async function prime() {
      if (!supabase) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!alive) return
      setUser(session?.user || null)
      if (session?.user) {
        const { data } = await supabase.from('profiles').select('avatar_url').eq('user_id', session.user.id).maybeSingle()
        if (!alive) return
        setAvatar(data?.avatar_url || '')
      }
    }
    prime()
    const { data: sub } = supabase?.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      if (!session?.user) setAvatar('')
      else {
        supabase.from('profiles').select('avatar_url').eq('user_id', session.user.id).maybeSingle()
          .then(({ data }) => setAvatar(data?.avatar_url || ''))
      }
    }) || { data: { subscription: { unsubscribe(){} } } }
    return () => { alive = false; sub.subscription?.unsubscribe?.() }
  }, [])

  async function signOut() { await supabase.auth.signOut(); nav('/auth') }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', borderBottom: '1px solid #eee' }}>
      <Link to="/" style={{ fontSize: 20, fontWeight: 700, color: C.ink, textDecoration: 'none' }}>TryMeDating</Link>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Link to="/explore" style={{ color: C.ink, textDecoration: 'none', fontWeight: 600 }}>Explore</Link>
        <Link to="/likes" style={{ color: C.ink, textDecoration: 'none', fontWeight: 600 }}>Likes</Link>
        <Link to="/messages" style={{ color: C.ink, textDecoration: 'none', fontWeight: 600 }}>Messages</Link>
        <Link to="/profile" style={{ color: C.ink, textDecoration: 'none', fontWeight: 600 }}>Profile</Link>
        <Link to="/settings" style={{ color: C.ink, textDecoration: 'none', fontWeight: 600 }}>Settings</Link>
        <Link to="/#how" style={{ color: C.ink, textDecoration: 'none' }}>How it works</Link>
        <Link to="/#community" style={{ color: C.ink, textDecoration: 'none' }}>Community</Link>
        <Link to="/#faqs" style={{ color: C.ink, textDecoration: 'none' }}>FAQs</Link>
        {!user ? (
          <button onClick={() => nav('/auth')} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: C.coral, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
            Sign up
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <img src={avatar || 'https://via.placeholder.com/28?text=%F0%9F%98%8A'} alt="me" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee' }} />
            <button onClick={signOut} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Footer
function Footer() {
  return (
    <div style={{ textAlign: 'center', padding: 20, borderTop: '1px solid #eee', marginTop: 40 }}>
      <Link to="/terms" style={{ marginRight: 16 }}>Terms</Link>
      <Link to="/privacy" style={{ marginRight: 16 }}>Privacy</Link>
      <Link to="/contact">Contact</Link>
    </div>
  )
}

// Main App
export default function App() {
  return (
    <div>
      <NavBar />
      <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/likes" element={<Likes />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:handle" element={<Messages />} /> {/* deep link to a chat */}
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/u/:handle" element={<PublicProfile />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<div style={{ padding: 40 }}>Page not found.</div>} />
        </Routes>
      </Suspense>
      <Footer />
    </div>
  )
}


