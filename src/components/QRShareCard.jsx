// src/components/QRShareCard.jsx
import QRCode from 'react-qr-code'

export default function QRShareCard({
  link,
  size = 220,
  label = 'Let them scan this to connect'
}) {
  if (!link) return null

  return (
    <div className="card" style={{ display: 'grid', justifyItems: 'center', gap: 16 }}>
      <div
        style={{
          background: '#fff',
          padding: 12,
          borderRadius: 12,
          border: '1px solid var(--border)'
        }}
      >
        <QRCode value={link} size={size} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{link}</div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <a className="btn" href={link} target="_blank" rel="noreferrer">Open link</a>
        <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(link)}>
          Copy link
        </button>
      </div>
    </div>
  )
}



