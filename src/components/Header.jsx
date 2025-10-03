// src/components/Header.jsx
import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import logo from '../assets/tmdlogo.png'

export function openChatWith(partnerId, partnerName = '') {
  // open a specific chat from anywhere
  window.dispatchEvent(new CustomEvent('open-chat', { detail: { partnerId, partnerName } }))
  if (window.openChat) window.openChat(partnerId, partnerName) // fallback
}

export default function Header({ me, unread = 0, onSignOut }) {
  const loc = useLocation()
  const authed = !!me?.id
  const isActive = (to) => (loc.pathname === to ? { opacity: 1 } : {})

  return (
    <header style={{ position:'sticky', top:0, zIndex:30, background:'#fff', borderBottom:'1px solid var(--border)' }}>
      <div className="container" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'10px 0' }}>
        {/* Brand */}
        <Link to="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }} aria-label="Go to home">
          <img src={logo} alt="TryMeDating" style={{ width:44, height:44, objectFit:'contain' }} />
          <div style={{ lineHeight:1 }}>
            <div style={{ fontWeight:900, fontSize:18, color:'#0f172a' }}>TryMeDating</div>
            <div className="muted" style={{ fontSize:12 }}>meet intentionally</div>
          </div>
        </Link>

        {/* Nav */}
        <nav style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Link className="btn btn-neutral" to="/" style={isActive('/')}>Home</Link>
          {authed && <Link className="btn btn-neutral" to="/profile" style={isActive('/profile')}>Profile</Link>}
          {authed && <Link className="btn btn-neutral" to="/settings" style={isActive('/settings')}>Settings</Link>}
          <Link className="btn btn-neutral" to="/contact" style={isActive('/contact')}>Contact</Link>
        </nav>

        {/* Right controls */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* SINGLE Messages button */}
          <button
            type="button"
            className="btn btn-header"
            onClick={() => {
              // open the launcher (works whether ChatLauncher caught the event or not)
              window.dispatchEvent(new CustomEvent('open-chat', { detail: {} }))
              if (window.openChat) window.openChat()
            }}
            aria-label="Open messages"
            title="Messages"
            style={{ position:'relative' }}
          >
            Messages
            {unread > 0 && (
              <span
                title={`${unread} unread`}
                style={{
                  position:'absolute', top:-6, right:-6, minWidth:18, height:18, lineHeight:'18px',
                  textAlign:'center', fontSize:11, fontWeight:700, background:'#ef4444', color:'#fff',
                  borderRadius:999, padding:'0 6px', boxShadow:'0 1px 3px rgba(0,0,0,0.2)'
                }}
              >
                {unread}
              </span>
            )}
          </button>

          {!authed ? (
            <Link className="btn btn-primary" to="/auth" style={isActive('/auth')}>Sign in</Link>
          ) : (
            <button className="btn btn-secondary" onClick={onSignOut} title="Sign out" aria-label="Sign out">
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  )
}


