// src/components/Footer.jsx
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer
      style={{
        marginTop: 40,
        padding: '20px',
        borderTop: '1px solid var(--border)',
        textAlign: 'center'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/privacy" className="btn btn-footer">Privacy</Link>
        <Link to="/terms" className="btn btn-footer">Terms</Link>
        <Link to="/contact" className="btn btn-footer">Contact</Link>
      </div>
      <div className="muted" style={{ marginTop: 12 }}>
        © {new Date().getFullYear()} TryME Dating
      </div>
    </footer>
  )
}
