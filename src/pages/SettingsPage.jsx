import React from 'react'
import { supabase } from '../lib/supabaseClient'

function SettingsPage() {
  if (!supabase) {
    return (
      <div style={{padding:40}}>
        <h2>Settings</h2>
        <p>Supabase is not configured. Add env vars and redeploy.</p>
      </div>
    )
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>Settings</h2>
      <button onClick={signOut} style={{marginTop:12,padding:'10px 14px'}}>Sign out</button>
    </div>
  )
}
export default SettingsPage

