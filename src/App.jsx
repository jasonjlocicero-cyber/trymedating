import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'

function Home() {
  return (
    <div className="container" style={{padding:'40px 0'}}>
      <h1>TryMeDating — Home ✅</h1>
      <p>If you see this, React Router is working. Next, we’ll re-add pages.</p>
      <div style={{display:'flex', gap:12, marginTop:12}}>
        <Link className="btn btn-primary" to="/auth">Go to Auth</Link>
        <Link className="btn btn-secondary" to="/profile">Go to Profile</Link>
        <Link className="btn btn-ghost" to="/u/test">Public Profile</Link>
      </div>
    </div>
  )
}

function AuthStub(){ return <div className="container" style={{padding:'40px 0'}}><h2>Auth stub</h2></div> }
function ProfileStub(){ return <div className="container" style={{padding:'40px 0'}}><h2>Profile stub</h2></div> }
function PublicStub(){ return <div className="container" style={{padding:'40px 0'}}><h2>Public stub</h2></div> }
function SettingsStub(){ return <div className="container" style={{padding:'40px 0'}}><h2>Settings stub</h2></div> }

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home/>} />
      <Route path="/auth" element={<AuthStub/>} />
      <Route path="/profile" element={<ProfileStub/>} />
      <Route path="/settings" element={<SettingsStub/>} />
      <Route path="/u/:handle" element={<PublicStub/>} />
    </Routes>
  )
}
