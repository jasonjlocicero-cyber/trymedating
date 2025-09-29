// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'

import Home from './pages/Home'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import PublicProfile from './pages/PublicProfile'
import SettingsPage from './pages/SettingsPage'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Onboarding from './pages/Onboarding'
import ChatDock from './components/ChatDock'
import ChatAlerts from './components/ChatAlerts'

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}

function Shell() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)

  // Chat dock state
  const [chatOpen, setChatOpen] = useState(false)
  const [activeConvoId, setActiveConvoId] = useState(null)
  const [activePeer, setActivePeer] = useState(null)

  // Recent known convos for this user (used by ChatAlerts)
  const recentKey = me?.id ? `recentConvos:${me.id}` : null
  const [recentConvoIds, setRecentConvoIds] = useState([])

  // Bootstrap auth
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setMe(user || null)
      setLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setMe(s?.user || null))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Load stored recent convos
  useEffect(() => {
    if (!recentKey) return
    try {
      const raw = localStorage.getItem(recentKey)
      const ids = raw ? JSON.parse(raw) : []
      setRecentConvoIds(Array.isArray(ids) ? ids : [])
    } catch {}
  }, [recentKey])

  // Persist recent convos
  function rememberConvo(id) {
    if (!recentKey || id == null) return
    setRecentConvoIds(prev => {
      const s = new Set(prev.map(String))
      s.add(String(id))
      const arr = Array.from(s)
      try { localStorage.setItem(recentKey, JSON.stringify(arr)) } catch {}
      return arr
    })
  }

  // Open chat helper (used by alerts + pages)
  function openChat(convoId, peer) {
    setActiveConvoId(convoId)
    setActivePeer(peer || null)
    setChatOpen(true)
    rememberConvo(convoId)
  }

  // Close chat
  function closeChat() {
    setChatOpen(false)
  }

  const authed = !!me?.id

  return (
    <div>
      <Header me={me} onOpenChat={openChat} />
      <main>
        <Routes>
          <Route path="/" element={<Home me={me} onOpenChat={openChat} />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/profile" element={<ProfilePage me={me} onOpenChat={openChat} />} />
          <Route path="/u/:handle" element={<PublicProfile me={me} onOpenChat={openChat} />} />
          <Route path="/settings" element={<SettingsPage me={me} />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes>
      </main>

      {/* Footer stays same */}
      <footer className="footer">
        <div className="container" style={{ padding: '14px 0' }}>
          <div className="footer-links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <a href="mailto:support@trymedating.com">Contact</a>
          </div>
        </div>
      </footer>

      {/* Global new-message alerts */}
      {authed && (
        <ChatAlerts
          me={me}
          isChatOpen={chatOpen}
          activeConvoId={activeConvoId}
          recentConvoIds={recentConvoIds}
          onOpenChat={openChat}
        />
      )}

      {/* Chat dock */}
      {chatOpen && (
        <ChatDock
          me={me}
          convoId={activeConvoId}
          peer={activePeer}
          open={chatOpen}
          onClose={closeChat}
        />
      )}
    </div>
  )
}

function Header({ me, onOpenChat }) {
  const nav = useNavigate()
  const authed = !!me?.id

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="brand">TryMeDating</Link>
        <nav className="nav">
          {authed ? (
            <>
              <Link to="/profile" className="nav-link">Profile</Link>
              <Link to="/settings" className="nav-link">Settings</Link>
              <button className="btn" onClick={() => onOpenChat(null)}>Messages</button>
            </>
          ) : (
            <Link to="/auth" className="btn btn-primary">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  )
}















