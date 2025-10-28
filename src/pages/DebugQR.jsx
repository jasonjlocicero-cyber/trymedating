// src/pages/DebugQR.jsx
import React from 'react'
import QRCode from 'react-qr-code'

export default function DebugQR() {
  const value = 'trymedating:debug-qr'
  return (
    <div className="container" style={{ padding: '32px 0' }}>
      <h1 style={{ marginBottom: 12 }}>QR Smoke Test</h1>
      <div className="card" style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
        <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
          <QRCode value={value} size={180} />
        </div>
        <div className="muted" style={{ fontSize: 12 }}>{value}</div>
      </div>
    </div>
  )
}
