import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'

// Import your page components
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
// If you’ve added PublicProfile.jsx, uncomment this line:
// import PublicProfile from './pages/PublicProfile'

function Home() {
  return (
    <div style={{padding:40, fontFamily:'ui-sans-serif, system-ui'}}>
      <h1>TryMeDating — Home ✅</h1>
      <p>Welcome to the TryMeDating prototype. Use the links below to navigate.</p>
      <div style={{display:'flex', gap:12, marginTop:12}}>
        <Link className="btn btn-primary" to="/auth">Auth</Link>
        <Link className="btn btn-secondary" to="/profile">Profile</Link>
        <Link className="btn btn-ghost" to="/settings">Settings</Link>
        {/* Uncomment this if PublicProfile.jsx exists */}
        {/* <Link className="btn" to="/u/test">Public Profile</Link> */}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Home route */}
      <Route path="/" element={<Home />} />

      {/* Real pages */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />

      {/* Public profile page (optional) */}
      {/* <Route path="/u/:handle" element={<PublicProfile />} /> */}
    </Routes>
  )
}
