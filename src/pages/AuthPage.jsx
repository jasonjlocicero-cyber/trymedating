import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AuthPage(){
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  if (!supabase) {
    return (
      <div style={{padding:40}}>
        <h2>Auth</h2>
        <p>Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Netlify → Site configuration → Build & deploy → <b>Environment</b>, then redeploy.</p>
      </div>
    )
  }

  async function sendLink(e){
    e.preventDefault()
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/profile' }
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div style={{padding:40, maxWidth:520}}>
      <h2>Sign in / Sign up</h2>
      {sent ? (
        <div>Check your inbox for the magic link.</div>
      ) : (
        <form onSubmit={sendLink} style={{display:'grid', gap:12}}>
          <input type="email" required placeholder="you@example.com" value={email}
                 onChange={e=>setEmail(e.target.value)} style={{padding:12,border:'1px solid #eee',borderRadius:8}} />
          <button type="submit" style={{padding:'10px 14px'}}>Send Sign-in Link</button>
          {error && <div style={{color:'#c00'}}>{error}</div>}
        </form>
      )}
    </div>
  )
}
