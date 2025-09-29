// src/pages/SettingsPage.jsx
import React from 'react'
import { supabase } from '../lib/supabaseClient'

export default function SettingsPage({ me }) {
  async function handleSignOut() {
    try { await supabase.auth.signOut() } catch {}
    window.location.href = '/'
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 720 }}>
      <h1>Settings</h1>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Account</h2>
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
          Signed in as {me?.email || '—'}.
        </div>
        <button className="btn" onClick={handleSignOut}>Sign out</button>
      </section>
    </div>
  )
}





