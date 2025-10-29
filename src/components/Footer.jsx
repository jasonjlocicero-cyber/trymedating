// src/components/Footer.jsx
import { Link } from 'react-router-dom'

export default function Footer() {
  const brandTeal = '#0f766e'
  const brandPink = '#f43f5e'

  const linkStyle = {
    padding: '6px 10px',
    borderRadius: 10,
    fontWeight: 600,
    textDecoration: 'none',
    color: '#111827',
    background: 'transparent',
    border: '1px solid var(--border)',
  }

  const pinkCtaStyle = {
    padding: '6px 12px',
    borderRadius: 10,
    fontWeight: 800,
    textDecoration: 'none',
    background: brandPink,
    border: `1px solid ${brandPink}`,
    color: '#fff',
  }

  return (
    <footer
      className="site-footer"
      style={{
        marginTop: 24,
        background: '#fff',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div
        className="container"
        style={{
          display: 'grid',
          gap: 10,
          alignItems: 'center',
          justifyItems: 'center',
          padding: '16px 0',
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            fontWeight: 900,
            fontSize: 18,
            letterSpacing: 0.2,
            display: 'flex',
            gap: 2,
            lineHeight: 1,
          }}
          aria-label="TryMeDating"
        >
          <span style={{ color: brandTeal }}>Try</span>
          <span style={{ color: brandTeal }}>Me</span>
          <span style={{ color: brandPink }}>Dating</span>
        </div>

        {/* Links */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/terms" style={linkStyle}>Terms</Link>
          <Link to="/privacy" style={linkStyle}>Privacy</Link>
          <Link to="/contact" style={linkStyle}>Contact</Link>
          {/* Brand-pink primary CTA */}
          <Link to="/feedback" style={pinkCtaStyle}>Feedback</Link>
        </div>

        {/* Copyright */}
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
          © {new Date().getFullYear()} TryMeDating. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
