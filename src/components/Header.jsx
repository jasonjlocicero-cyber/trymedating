// src/components/Header.jsx
import { Link, useLocation } from 'react-router-dom'
import tmdlogo from '../assets/tmdlogo.png' // ← always this filename

export default function Header({ me, onSignOut }) {
  const loc = useLocation()
  const authed = !!me?.id
  const isAdmin = !!me?.is_admin

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
          paddingTop: 12,
          paddingBottom: 12
        }}
      >
        {/* Left: brand logo */}
        <Link to="/" aria-label="TryMeDating home" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src={tmdlogo}
            alt="TryMeDating"
            style={{ height: 36, width: 'auto', objectFit: 'contain' }}
          />
        </Link>

        {/* Center: primary nav */}
        <nav style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/" className="btn btn-neutral" aria-current={loc.pathname === '/' ? 'page' : undefined}>Home</Link>
          {authed && (
            <>
              <Link to="/profile" className="btn btn-neutral" aria-current={loc.pathname.startsWith('/profile') ? 'page' : undefined}>Profile</Link>
              <Link to="/settings" className="btn btn-neutral" aria-current={loc.pathname.startsWith('/settings') ? 'page' : undefined}>Settings</Link>
            </>
          )}
          <Link to="/contact" className="btn btn-neutral" aria-current={loc.pathname.startsWith('/contact') ? 'page' : undefined}>Contact</Link>
          {isAdmin && (
            <Link to="/admin" className="btn btn-neutral" aria-current={loc.pathname.startsWith('/admin') ? 'page' : undefined}>Admin</Link>
          )}
        </nav>

        {/* Right: actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <Link to="/messages" className="btn btn-header">Messages</Link>
          {authed ? (
            <button type="button" className="btn btn-neutral" onClick={onSignOut} title="Sign out">
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

