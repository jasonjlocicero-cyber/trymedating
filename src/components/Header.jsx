// src/components/Header.jsx
import { Link, useLocation } from 'react-router-dom'
import tmdlogo from '../assets/tmdlogo.png'

export default function Header({ me, onSignOut }) {
  const loc = useLocation()
  const authed = !!me?.id
  const isAdmin = !!me?.is_admin

  // Utility to style active nav links
  const navLink = (to, label) => {
    const active = loc.pathname === to || loc.pathname.startsWith(to + '/')
    return (
      <Link
        key={to}
        to={to}
        className="btn btn-neutral"
        style={{
          fontWeight: active ? 700 : 500,
          borderBottom: active ? '3px solid var(--brand-teal)' : '3px solid transparent',
          paddingBottom: 4
        }}
      >
        {label}
      </Link>
    )
  }

  return (
    <header
      className="site-header"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: '#fff',
        borderBottom: '1px solid var(--border)'
      }}
    >
      <div
        className="container"
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          gap: 12,
          padding: '12px 0'
        }}
      >
        {/* Logo */}
        <Link to="/" aria-label="TryMeDating home" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src={tmdlogo}
            alt="TryMeDating"
            style={{ height: 108, width: 'auto', objectFit: 'contain' }}
          />
        </Link>

        {/* Nav */}
        <nav style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          {navLink('/', 'Home')}
          {authed && navLink('/profile', 'Profile')}
          {authed && navLink('/settings', 'Settings')}
          {navLink('/contact', 'Contact')}
          {isAdmin && navLink('/admin', 'Admin')}
        </nav>

        {/* Right side actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <Link to="/messages" className="btn btn-header">Messages</Link>
          {authed ? (
            <button type="button" className="btn btn-neutral" onClick={onSignOut}>
              Sign out
            </button>
          ) : (
            <Link to="/auth" className="btn btn-header">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  )
}


