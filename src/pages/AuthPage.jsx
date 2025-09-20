import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AuthPage(){
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

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
    <div className="container" style={{padding:'40px 0', maxWidth:520}}>
      <h2>Sign in / Sign up</h2>
      <p>We’ll send a secure sign-in link to your email.</p>
      {sent ? (
        <div className="card">Check your inbox for the magic link.</div>
      ) : (
        <form onSubmit={sendLink} className="card" style={{display:'grid', gap:12}}>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            style={{padding:12, borderRadius:12, border:'1px solid #eee'}}
          />
          <button className="btn btn-primary" type="submit">Send Sign-in Link</button>
          {error && <div style={{color:'#c00'}}>{error}</div>}
        </form>
      )}
    </div>
  )
}
