import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'

export default function App() {
  return (
    <div>
      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="brand">TryMeDating</Link>
          <nav className="nav">
            <Link to="/" className="nav-link">Home</Link>
            <a className="nav-link" href="mailto:support@trymedating.com">Contact</a>
          </nav>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<div className="container" style={{padding:24}}>Not found</div>} />
        </Routes>
      </main>

      <footer className="footer">
        <div className="container" style={{ padding: '14px 0' }}>
          <div className="footer-links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <a href="mailto:support@trymedating.com">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}















