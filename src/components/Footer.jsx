// src/components/Footer.jsx
import { Link } from 'react-router-dom'

export default function Footer() {
  const brandTeal = '#0f766e'
  const brandPink = '#f43f5e'

  const pill = (bg) => ({
    padding: '8px 12px',
    borderRadius: 12,
    fontWeight: 700,
    textDecoration: 'none',
    background: bg,
    color: '#fff',
    border: `1px solid ${bg}`,
    lineHeight: 1,
    display: 'inline-block',
  })

  // Alternate colors to “fill out evenly”
  const items = [
    { to: '/terms', label: 'Terms', color: brandTeal },
    { to: '/privacy', label: 'Privacy', color: brandPink },
    { to: '/contact', label: 'Contact', color: brandTeal },
    { to: '/feedback', label: 'Feedback', color: brandPink }, // pink CTA
  ]

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

        {/* Buttons: evenly filled with brand colors */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {items.map((it) => (
            <Link key={it.to} to={it.to} style={pill(it.color)}>
              {it.label}
            </Link>
          ))}
        </div>

        {/* Copyright */}
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
          © {new Date().getFullYear()} TryMeDating. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
