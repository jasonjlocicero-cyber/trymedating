// src/components/QRShareCard.jsx
import React from 'react'
import QRCode from 'react-qr-code'

export default function QRShareCard({ value, size = 220, label = 'Scan to connect', className = '' }) {
  if (!value) return null
  const png = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`

  return (
    <div className={`card ${className}`} style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
      <div style={{ background: '#fff', padding: 8, border: '1px solid var(--border)', borderRadius: 12 }}>
        <QRCode value={value} size={size} bgColor="#ffffff" fgColor="#111111" />
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
        <div className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>{value}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(value)}>Copy link</button>
        <a className="btn btn-neutral" href={png} download="invite-qr.png">Download PNG</a>
      </div>

      {/* If JS or SVG rendering failed, PNG still shows */}
      <noscript>
        <img src={png} alt="QR" width={size} height={size} />
      </noscript>
    </div>
  )
}



