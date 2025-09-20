import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'

function Home() {
  return (
    <div style={{padding:40, fontFamily:'ui-sans-serif, system-ui'}}>
      <h1>TryMeDating — Home ✅</h1>
      <p>Router baseline. If you see this, routing works.</p>
      <div style={{display:'flex', gap:12, marginTop:12}}>
        <Link to="/auth">Auth</Link>
        <Link to="/profile">Profile</Link>
        <Link to="/settings">Settings</Link>
      </div>
    </div>
  )
}

function Stub({ label }) {
  return <div style={{padding:40, fontFamily:'ui-sans-serif, system-ui'}}><h2>{label} page</h2></div>
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
