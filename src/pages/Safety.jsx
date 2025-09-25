// src/pages/Safety.jsx
import React from 'react'
import { Link } from 'react-router-dom'

export default function Safety() {
  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 820 }}>
      <h1 style={{ marginBottom: 8 }}>
        <span style={{ color: 'var(--secondary)', fontWeight: 800 }}>Safety</span>{' '}
        <span style={{ color: 'var(--primary)', fontWeight: 800 }}>Tips</span>
      </h1>
      <p style={{ color: 'var(--muted)' }}>
        TryMeDating is designed for in-person introductions first. Keep these simple precautions in mind.
      </p>

      <div className="card" style={{ display: 'grid', gap: 14 }}>
        <Tip n="1" title="Only connect with people you actually met">
          Your network should reflect real-world encounters. Share your QR code only after a genuine interaction.
        </Tip>
        <Tip n="2" title="Meet in public, tell a friend">
          Choose busy locations for first meets. Share your plans (who, where, when) with a trusted friend.
        </Tip>
        <Tip n="3" title="Protect personal details">
          Don’t share home address, financial info, or private photos. Keep conversations in the app until you’re sure.
        </Tip>
        <Tip n="4" title="Use the Block & Remove tools">
          If someone makes you uncomfortable, block them and remove the connection from your Network page.
        </Tip>
        <Tip n="5" title="Trust your instincts">
          If something feels off, it probably is. End the chat, leave the situation, or ask staff for help.
        </Tip>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Need to manage a connection?</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" to="/network">Open My Network</Link>
          <Link className="btn" to="/invite">Share My QR</Link>
        </div>
      </div>
    </div>
  )
}

function Tip({ n, title, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 12, alignItems: 'start' }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center',
        background: 'linear-gradient(135deg, var(--secondary), var(--primary))', color: '#fff', fontWeight: 800
      }}>
        {n}
      </div>
      <div>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>{title}</div>
        <div style={{ color: 'var(--muted)' }}>{children}</div>
      </div>
    </div>
  )
}
