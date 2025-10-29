import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Teal, Teal, Coral, Coral for a balanced look */}
          <Link to="/terms" className="btn btn-primary btn-pill">Terms</Link>
          <Link to="/privacy" className="btn btn-primary btn-pill">Privacy</Link>
          <Link to="/contact" className="btn btn-accent btn-pill">Contact</Link>
          <Link to="/feedback" className="btn btn-accent btn-pill">Feedback</Link>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
          © {new Date().getFullYear()} TryMeDating. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
