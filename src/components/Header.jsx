// src/components/Header.jsx
import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import logo from '../assets/tmdlogo.png'

// === Open a specific chat from anywhere ===
// Usage in any file: import { openChatWith } from '../components/Header'
// then: openChatWith('<user-id>', 'Their Name')
export function openChatWith(partnerId, partnerName = '') {
  window.dispatchEvent(
    new CustomEvent('open-chat', { detail: { partnerId, partnerName } })
  )
}

export default function Header({ me, unread = 0, onSignOut }) {
  const loc = useLocation()
  const authed = !!me?.id

  // simple active style helper
  const isActive = (to) => (loc.pathname === to ? { opacity: 1 } : {})

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: '#fff',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 0',
        }}
      >
        {/* Left: Logo + brand */}
        <Link
          to="/"
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
          aria-label="Go to home"
        >
          <img
            src={logo}
            alt="TryMeDating"
            style={{ width: 44, height: 44, objectFit: 'contain' }}
          />
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: '#0f172a' }}>TryMeDating</div>
            <div className="muted" style={{ fontSize: 12 }}>meet intentionally</div>
          </div>
        </Link>

        {/* Center: primary nav */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: '0 1 auto',
          }}
        >
          <Link className="btn btn-neutral" to="/" style={isActive('/')}>
            Home
          </Link>

          {authed && (
            <Link className="btn btn-neutral" to="/profile" style={isActive('/profile')}>
              Profile
            </Link>
          )}

          {authed && (
            <Link className="btn btn-neutral" to="/settings" style={isActive('/settings')}>
              Settings
            </Link>
          )}

          <Link className="btn btn-neutral" to="/contact" style={isActive('/contact')}>
            Contact
          </Link>
        </nav>

        {/* Right: messaging + auth */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Messages opener (opens the ChatLauncher) */}
          <button
            type="button"
            className="btn btn-header"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('open-chat', { detail: {} }))
            }
            style={{ position: 'relative' }}
            aria-label="Open messages"
            title="Messages"
          >
            Messages
            {unread > 0 && (
              <span
                title={`${unread} unread`}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  lineHeight: '18px',
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: 999,
                  padding: '0 6px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              >
                {unread}
              </span>
            )}
          </button>

          {/* Auth actions */}
          {!authed ? (
            <Link className="btn btn-primary" to="/auth" style={isActive('/auth')}>
              Sign in
            </Link>
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


