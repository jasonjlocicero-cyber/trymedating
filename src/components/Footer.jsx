// src/components/Footer.jsx
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/terms" className="btn btn-footer">Terms</Link>
          <Link to="/privacy" className="btn btn-footer">Privacy</Link>
          <Link to="/contact" className="btn btn-footer">Contact</Link>
          <Link to="/feedback" className="btn btn-footer">Feedback</Link>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
          © {new Date().getFullYear()} TryMeDating. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
