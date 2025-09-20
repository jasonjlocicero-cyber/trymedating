import React from 'react'
import { supabase } from '../lib/supabaseClient'

function SettingsPage() {
  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div style={{ padding: 40, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h2>Settings</h2>
      <div style={{ marginTop: 20 }}>
        <p>Privacy is enforced by default. You can toggle public/private in your Profile.</p>
        <button onClick={signOut} style={{ marginTop: 12, padding: '10px 14px' }}>
          Sign out
        </button>
      </div>
    </div>
  )
}

// ✅ This export is required so App.jsx can import it
export default SettingsPage

