iimport React from 'react'
import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'

function Home() {
  return (
    <div className="container" style={{padding:'40px 0'}}>
      <h1>TryMeDating — Home ✅</h1>
      <p>Baseline router render.</p>
      <div style={{display:'flex', gap:12, marginTop:12}}>
        <Link className="btn btn-primary" to="/auth">Auth</Link>
        <Link className="btn btn-secondary" to="/profile">Profile</Link>
        <Link className="btn btn-ghost" to="/settings">Settings</Link>
      </div>
    </div>
  )
}

function Stub({ label }) {
  return <div className="container" style={{padding:'40px 0'}}><h2>{label} page</h2></div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/auth" element={<Stub label="Auth" />} />
      <Route path="/profile" element={<Stub label="Profile" />} />
      <Route path="/settings" element={<Stub label="Settings" />} />
    </Routes>
  )
}
