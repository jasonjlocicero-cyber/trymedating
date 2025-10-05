// src/components/Header.jsx
import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import logo from '../assets/tmdlogo.png'

// Open a specific chat from anywhere (optional helper)
export function openChatWith(partnerId, partnerName = '') {
  if (window.openChat) return window.openChat(partnerId, partnerName)
  window.dispatchEvent(new CustomEvent('open-chat', { detail: { partnerId, partnerName } }))
}

export default function Header({ me, unread = 0, onSignOut }) {
  const loc = useLocation()
  const authed = !!me?.id
  const isActive = (to) => (loc.pathname === to ? { opacity: 1 } : {})

  return (
    <header style={{ position:'sticky', top:0, zIndex:30, background:'#fff', borderBottom:'1px solid var(--border)' }}>
      <div
        className="container"
        style={{
          display:'flex',
          alignItems:'center',
          justifyContent:'space-between',
          gap:12,
          padding:'10px 0'
        }}
      >
        {/* Brand: logo with tagline underneath */}
        <Link
          to="/"
          style={{
            display:'flex',
            flexDirection:'column',
            alignItems:'center',
            textDecoration:'none',
            lineHeight:1.1
          }}
          aria-label="Go to home"
        >
          <img
            src={logo}
            alt="TryMeDating"
            style={{
              height: 80,
              width: 'auto',
              objectFit:'contain',
              display:'block'
            }}
          />
          <div
            style={{
              fontWeight: 700,
              fontSize: 20,
              color:'#f9735b',   // brand coral/orange
              marginTop: 6,
              textAlign: 'center',
              letterSpacing: 0.5
            }}
          >
            meet intentionally
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
          <button
            type="button"
            className="btn btn-header"
            onClick={() => {
              if (window.openChat) window.openChat()
              else window.dispatchEvent(new CustomEvent('open-chat', { detail: {} }))
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
                  position:'absolute',
                  top:-6,
                  right:-6,
                  minWidth:18,
                  height:18,
                  lineHeight:'18px',
                  textAlign:'center',
                  fontSize:11,
                  fontWeight:700,
                  background:'#ef4444',
                  color:'#fff',
                  borderRadius:999,
                  padding:'0 6px',
                  boxShadow:'0 1px 3px rgba(0,0,0,0.2)'
                }}
              >
                {unread}
              </span>
            )}
          </button>

          {!authed ? (
            <Link className="btn btn-primary" to="/auth" style={isActive('/auth')}>Sign in</Link>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
