// src/components/QRShareCard.jsx
import React, { useMemo, useRef } from 'react'
import QRCode from 'react-qr-code'

/**
 * Renders a QR code with helper actions.
 * Props:
 *  - value: string (URL to encode)
 *  - title?: string
 *  - subtitle?: string
 */
export default function QRShareCard({ value = '', title = 'Your Invite QR', subtitle }) {
  const wrapRef = useRef(null)

  // Fallback demo so you can see the component even if value is empty
  const display = useMemo(
    () => value || 'https://example.com/connect?code=DEMO-123456',
    [value]
  )

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(display)
      alert('Invite link copied!')
    } catch {
      // no-op
    }
  }

  function downloadSvg() {
    // find the <svg> rendered by react-qr-code and serialize it
    const svg = wrapRef.current?.querySelector('svg')
    if (!svg) return
    const serializer = new XMLSerializer()
    const svgBlob = new Blob([serializer.serializeToString(svg)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'invite-qr.svg'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Use the "Dating" pink for primary QR actions
  const roseBtnStyle = {
    background: '#f43f5e',
    borderColor: '#f43f5e',
    color: '#fff'
  }

  return (
    <div
      className="card"
      style={{
        display: 'grid',
        gap: 14,
        justifyItems: 'center',
        padding: 16,
        borderRadius: 12
      }}
      ref={wrapRef}
    >
      <div style={{ fontWeight: 800 }}>{title}</div>
      {subtitle && <div className="muted" style={{ textAlign: 'center' }}>{subtitle}</div>}

      <div
        style={{
          background: '#fff',
          padding: 10,
          border: '1px solid var(--border)',
          borderRadius: 12
        }}
      >
        <QRCode value={display} size={220} style={{ display: 'block' }} />
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>{display}</div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" style={roseBtnStyle} onClick={copyLink}>
          Copy link
        </button>
        <button className="btn" onClick={downloadSvg}>
          Download SVG
        </button>
      </div>
    </div>
  )
}




