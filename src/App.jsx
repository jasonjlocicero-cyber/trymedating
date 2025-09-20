import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'

function Home() {
  return (
    <div className="container" style={{padding:'40px 0'}}>
      <h1>TryMeDating — Home ✅</h1>
      <p>If you see this, the app is healthy.</p>
      <div style={{display:'flex', gap:12, marginTop:12}}>
        <Link className="btn btn-primary" to="/auth">Auth</Link>
        <Link className="btn btn-secondary" to="/profile">Profile</Link>
        <Link className="btn btn-ghost" to="/settings">Settings</Link>
        <Link className="btn" to="/u/test">Public Profile</Link>
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
      <Route path="/" element={<Home/>} />
      <Route path="/auth" element={<Stub label="Auth" />} />
      <Route path="/profile" element={<Stub label="Profile" />} />
      <Route path="/settings" element={<Stub label="Settings" />} />
      <Route path="/u/:handle" element={<Stub label="Public profile" />} />
    </Routes>
  )
}
