import React from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import PublicProfile from './pages/PublicProfile'

function Home() {
  const nav = useNavigate()
  return (
    <div className="container" style={{padding:'40px 0'}}>
      <h1>TryMeDating — Home</h1>
      <p>Router smoke test. If you can see this after deploy, routing compiles.</p>
      <div style={{display:'flex', gap:12, marginTop:12}}>
        <button className="btn btn-primary" onClick={()=>nav('/auth')}>Go to Auth</button>
        <button className="btn btn-secondary" onClick={()=>nav('/profile')}>Go to Profile</button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Home/>} />
        <Route path="/auth" element={<AuthPage/>} />
        <Route path="/profile" element={<ProfilePage/>} />
        <Route path="/settings" element={<SettingsPage/>} />
        <Route path="/u/:handle" element={<PublicProfile/>} />
      </Routes>
    </div>
  )
}

