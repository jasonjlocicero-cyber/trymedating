// src/pages/Home.jsx
import React from 'react'
import { Link } from 'react-router-dom'
import tmdlogo from '../assets/tmdlogo.png' // hero logo (blue/pink mark)

export default function Home() {
  const heroStyle = {
    display: 'grid',
    gap: 16,
    justifyItems: 'center',
    textAlign: 'center',
    padding: '36px 16px',
    background: 'var(--bg-light)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    marginTop: 20
  }

  // Centered logo wrapper so it sits perfectly in the hero
  const logoWrap = {
    width: 'min(220px, 70vw)',
    display: 'grid',
    placeItems: 'center',
    marginTop: 4
  }

  // Crisp sizing across devices (keeps aspect ratio)
  const logoImg = {
    width: '100%',
    height: 'auto',
    maxWidth: 180,
    objectFit: 'contain',
    display: 'block'
  }

  const brandTitle = {
    fontSize: 'clamp(28px, 4vw, 44px)',
    lineHeight: 1.1,
    margin: '8px 0 6px',
    fontWeight: 900,
    letterSpacing: '-0.02em'
  }

  const sub = {
    color: 'var(--muted)',
    maxWidth: 760,
    margin: 0
  }

  const actionsRow = {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6
  }

  const featuresGrid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(12, 1fr)',
    gap: 16
  }

  const card = {
    gridColumn: 'span 12',
    background: 'var(--bg-light)',
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

  const teaserLeft = { fontWeight: 800 }
  const teaserBtns = { display: 'flex', gap: 8, flexWrap: 'wrap' }

  return (
    <main className="container" style={{ maxWidth: 1100 }}>
      {/* Hero */}
      <section style={heroStyle}>
        {/* Centered hero mark */}
        <div style={logoWrap}>
          <img
            src={tmdlogo}
            alt="TryMeDating"
            style={logoImg}
            draggable="false"
          />
        </div>

        <h1 style={brandTitle}>
          Welcome to{' '}
          <span style={{ color: 'var(--brand-teal)' }}>TryME</span>
          <span style={{ color: 'var(--brand-coral)' }}>Dating</span>
        </h1>

        <p style={sub}>
          Invite-only dating that starts with a real-world moment. Share your QR in person,
          connect privately by default, and move at your own pace.
        </p>

        <div style={actionsRow}>
          {/* Using existing classes (we’ll adjust header buttons when we do Header.jsx) */}
          <Link to="/auth" className="btn btn-primary">Get started</Link>
          <Link to="/privacy" className="btn btn-neutral">Privacy</Link>
          <Link to="/terms" className="btn btn-neutral">Terms</Link>
          <Link to="/contact" className="btn btn-neutral">Contact</Link>
        </div>

        {/* Subtle brand divider */}
        <div
          aria-hidden="true"
          style={{
            width: 'min(760px, 92%)',
            height: 1,
            background: 'var(--border)',
            marginTop: 6
          }}
        />
      </section>

      {/* Features */}
      <section style={{ marginTop: 20 }}>
        <div style={featuresGrid}>
          <div style={{ ...card, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              💬 Real conversations, not swipes
            </div>
            <p className="muted" style={{ margin: 0 }}>
              You control who can reach you. Messaging opens after you’ve shared your invite QR
              or handle in person—so every chat starts with context.
            </p>
          </div>

          <div style={{ ...card, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              🔒 Private by default
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Your profile stays private unless you decide to make it public. Toggle visibility
              anytime. Share only what you want, when you want.
            </p>
          </div>

          <div style={{ ...card, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
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
        <div style={teaserLeft}>Ready to try it?</div>
        <div style={teaserBtns}>
          <Link to="/auth" className="btn btn-accent">Create your profile</Link>
          <Link to="/u/your-handle" className="btn btn-neutral">See a sample profile</Link>
        </div>
      </section>
    </main>
  )
}




