// src/pages/Home.jsx
import React from 'react'
import { Link } from 'react-router-dom'
import tmdlogo from '../assets/tmdlogo.png' // updated logo import

export default function Home() {
  const heroStyle = {
    display: 'grid',
    gap: 16,
    justifyItems: 'center',
    textAlign: 'center',
    padding: '36px 16px',
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 16,
    marginTop: 20
  }

  const brandTitle = {
    fontSize: 'clamp(28px, 4vw, 44px)',
    lineHeight: 1.1,
    margin: '8px 0 6px',
    fontWeight: 800
  }

  const sub = { color: 'var(--muted)', maxWidth: 760 }

  const featuresGrid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(12, 1fr)',
    gap: 16
  }

  const card = {
    gridColumn: 'span 12',
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16
  }

  const teaserStrip = {
    marginTop: 20,
    background: 'var(--brand-teal)',
    color: '#fff',
    borderRadius: 12,
    padding: '18px 16px',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'space-between'
  }

  return (
    <main className="container" style={{ maxWidth: 1100 }}>
      {/* Hero */}
      <section style={heroStyle}>
        <img
          src={tmdlogo}
          alt="TryMeDating"
          style={{ height: 96, width: 'auto', objectFit: 'contain' }}
        />
        <h1 style={brandTitle}>
          Welcome to{' '}
          <span style={{ color: 'var(--brand-teal)' }}>TryME</span>
          <span style={{ color: 'var(--brand-coral)' }}>Dating</span>
        </h1>
        <p style={sub}>
          Invite-only dating that starts with a real-world moment. Share your QR in person,
          connect privately by default, and move at your own pace.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          <Link to="/auth" className="btn btn-header">Get started</Link>
          <Link to="/privacy" className="btn btn-neutral">Privacy</Link>
          <Link to="/terms" className="btn btn-neutral">Terms</Link>
          <Link to="/contact" className="btn btn-neutral">Contact</Link>
        </div>
      </section>

      {/* Features */}
      <section style={{ marginTop: 20 }}>
        <div style={featuresGrid}>
          <div style={{ ...card, display:'grid', gap:8 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              💬 Real conversations, not swipes
            </div>
            <p className="muted" style={{ margin: 0 }}>
              You control who can reach you. Messaging opens after you’ve shared your invite QR
              or handle in person—so every chat starts with context.
            </p>
          </div>

          <div style={{ ...card, display:'grid', gap:8 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              🔒 Private by default
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Your profile stays private unless you decide to make it public. Toggle visibility
              anytime. Share only what you want, when you want.
            </p>
          </div>

          <div style={{ ...card, display:'grid', gap:8 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              🪪 Your invite QR
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Generate a personal QR right from your profile. Meet someone? Let them scan to connect.
              No handles to type, no awkward search.
            </p>
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section style={teaserStrip}>
        <div style={{ fontWeight: 700 }}>
          Ready to try it?
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <Link to="/auth" className="btn btn-header">Create your profile</Link>
          <Link to="/u/your-handle" className="btn btn-footer">See a sample profile</Link>
        </div>
      </section>
    </main>
  )
}



