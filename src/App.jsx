iimport React from 'react'
import { Routes, Route, Link } from 'react-router-dom'

// ✅ import your real pages
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'

function Home() {
  return (
    <div className="container" style={{padding:'40px 0'}}>
      <h1>TryMeDating — Home ✅</h1>
      <p>Router smoke test.</p>
      <div style={{display:'flex', gap:12, marginTop:12}}>
        <Link className="btn btn-primary" to="/auth">Auth</Link>
        <Link className="btn btn-secondary" to="/profile">Profile</Link>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* ✅ these two now render your real components */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/profile" element={<ProfilePage />} />
    </Routes>
  )
}
