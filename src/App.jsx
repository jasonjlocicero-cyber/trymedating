// src/App.jsx
import React, { useEffect, useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'

import Home from './pages/Home'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'

import ChatDock from './components/ChatDock'
import ChatAlerts from './components/ChatAlerts'

export default function App() {
  const [me, setMe] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  // Chat state
  const [chatOpen, setChatOpen] = useState(false)
  const [activeConvoId, setActiveConvoId] = useState(null)
  const [activePeer, setActivePeer] = useState(null)
  const [recentConvoIds, setRecentConvoIds] = useState([])

  useEffect(() => {
    let unsub = () => {}
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setMe(user || null)
      } catch (e) {
        console.error(e)
      } finally {
        setAuthReady(true)
      }
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
        setMe(session?.user || null)
      })
      unsub = () => sub.subscription.unsubscribe()
    })()
    return () => unsub()
  }, [])

  // persist recent convos per-user
  const recentKey = me?.id ? `recentConvos:${me.id}` : null
  useEffect(() => {
    if (!recentKey) return
    try {
      const raw = localStorage.getItem(recentKey)
      setRecentConvoIds(raw ? JSON.parse(raw) : [])
    } catch {}
  }, [recentKey])
  function rememberConvo(id) {
    if (!recentKey || id == null) return
    setRecentConvoIds(prev => {
      const s = new Set(prev.map(String)); s.add(String(id))
      const arr = Array.from(s)
      try { localStorage.setItem(recentKey, JSON.stringify(arr)) } catch {}
      return arr
    })
  }

  function openChat(convoId, peer) {
    setActiveConvoId(convoId ?? null)
    setActivePeer(peer ?? null)
    setChatOpen(true)
    if (convoId != null) rememberConvo(convoId)
  }
  function closeChat() { setChatOpen(false) }

  return (
    <div>
      <Header me={me} onOpenChat={() => openChat(null)} />
      <main>
        <Routes>
          <Route path="/" element={<Home me={me} onOpenChat={openChat} />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/profile" element={<ProfilePage me={me} />} />
          <Route path="/settings" element={<SettingsPage me={me} />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<div className="container" style={{padding:24}}>Not found</div>} />
        </Routes>
      </main>
      <Footer />

      {/* Global toast alerts */}
      {!!me?.id && (
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

      {!authReady && (
        <div className="container" style={{ padding: 8, fontSize: 12, color: 'var(--muted)' }}>
          Initializing…
        </div>
      )}
    </div>
  )
}

function Header({ me, onOpenChat }) {
  const nav = useNavigate()
  const authed = !!me?.id
  async function handleSignOut() { try { await supabase.auth.signOut() } catch {} nav('/') }

  return (
    <header className="header">
      <div className="container header-inner" style={{ gap: 12 }}>
        <Link to="/" className="brand" aria-label="TryMeDating">
          {/* LOGO IMAGE */}
          <img
            src="/logo.png"
            alt="TryMeDating"
            className="brand-logo"
            style={{
              display: 'block',
              height: 36,           // tweak if you want the logo larger/smaller
              width: 'auto',
              objectFit: 'contain'
            }}
          />
        </Link>

        <nav className="nav">
          <Link to="/" className="nav-link">Home</Link>
          {authed && <Link to="/profile" className="nav-link">Profile</Link>}
          {authed && <Link to="/settings" className="nav-link">Settings</Link>}
          <a className="nav-link" href="mailto:support@trymedating.com">Contact</a>
          {authed ? (
            <>
              <button className="btn" onClick={onOpenChat}>Messages</button>
              <button className="btn" onClick={handleSignOut}>Sign out</button>
            </>
          ) : (
            <Link to="/auth" className="btn btn-primary">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container" style={{ padding: '14px 0' }}>
        <div className="footer-links">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <a href="mailto:support@trymedating.com">Contact</a>
        </div>
      </div>
    </footer>
  )
}

















