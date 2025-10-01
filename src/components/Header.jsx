// src/components/Header.jsx
import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header
      style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      {/* Logo / brand */}
      <Link
        to="/"
        style={{
          fontWeight: 800,
          fontSize: 20,
          textDecoration: 'none',
          color: 'var(--text)'
        }}
      >
        TryME<span style={{ color: 'var(--brand-coral)' }}>Dating</span>
      </Link>

      {/* Nav buttons */}
      <nav style={{ display: 'flex', gap: 10 }}>
        <Link to="/auth" className="btn btn-header">Sign In</Link>
        <Link to="/about" className="btn btn-neutral">About</Link>
      </nav>
    </header>
  )
}

