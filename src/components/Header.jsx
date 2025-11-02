// src/components/Header.jsx
import React from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function Header({ me, unread = 0, onSignOut }) {
  const { pathname } = useLocation()
  const active = (p) => (pathname === p ? { boxShadow: 'inset 0 0 0 2px var(--brand-teal)' } : {})

  const UnreadPill = unread > 0 && (
    <span
      aria-label={`${unread} unread`}
      title={`${unread} unread`}
      style={{
        marginLeft: 6,
        padding: '0 7px',
        borderRadius: 999,
        background: 'var(--brand-coral)',
        color: '#fff',
        fontSize: 12,
        fontWeight: 800,
        lineHeight: '18px',
        minWidth: 18,
        display: 'inline-flex',
        justifyContent: 'center'
      }}
    >
      {unread > 99 ? '99+' : unread}
    </span>
  )

  return (
    <header className="site-header">
      <div className="container" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
        {/* Brand */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo-mark.png" alt="" width={26} height={26} />
          <strong style={{ fontSize: 18 }}>TryMeDating</strong>
        </Link>

        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link className="btn btn-neutral btn-pill" style={active('/')} to="/">Home</Link>

          {me?.id ? (
            <>
              <Link
                className="btn btn-neutral btn-pill"
                style={active('/chat')}
                to="/chat"
              >
                Messages {UnreadPill}
              </Link>
              <button className="btn btn-accent btn-pill" onClick={onSignOut}>Sign out</button>
            </>
          ) : (
            <Link className="btn btn-primary btn-pill" to="/auth">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  )
}















