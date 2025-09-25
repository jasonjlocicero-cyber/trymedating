// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function PublicProfile() {
  const { handle } = useParams()
  const [me, setMe] = useState(null)
  const [prof, setProf] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Load auth user (so we can enable "Message" if signed in)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setMe(user || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setMe(session?.user || null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Load profile by handle
  useEffect(() => {
    if (!handle) return
    let alive = true
    ;(async () => {
      setLoading(true); setError('')
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_url, bio, age, location, interests')
        .eq('handle', handle.toLowerCase())
        .maybeSingle()
      if (!alive) return
      if (error) setError(error.message)
      setProf(data || null)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [handle])

  function message() {
    if (!prof?.handle) return
    // if not signed in, go sign in and come back here
    if (!me) {
      window.location.href = '/auth?next=' + encodeURIComponent(window.location.pathname)
      return
    }
    // open chat (ChatDock provides window.trymeChat)
    if (!window.trymeChat) {
      alert('Messaging not ready on this page. Try a hard refresh.')
      return
    }
    window.trymeChat.open({ handle: prof.handle })
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: '32px 0' }}>
        <div className="card">Loading profile…</div>
      </div>
    )
  }

  if (error || !prof) {
    return (
      <div className="container" style={{ padding: '32px 0' }}>
        <div className="card" style={{ borderColor: '#e11d48', color: '#e11d48' }}>
          {error || 'Profile not found.'}
        </div>
      </div>
    )
  }

  return (
    <div className="container" style={{ padding: '32px 0' }}>
      {/* Header / identity */}
      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <img
            src={prof.avatar_url || 'https://via.placeholder.com/96?text=%F0%9F%91%A4'}
            alt=""
            style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
          />
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ margin: 0 }}>{prof.display_name || prof.handle}</h1>
            <div className="badge">@{prof.handle}</div>
            {prof.location && <div style={{ color: 'var(--muted)', marginTop: 6 }}>{prof.location}</div>}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={message}>Message</button>
          </div>
        </div>

        {/* Bio */}
        {prof.bio && (
          <p style={{ marginTop: 4 }}>{prof.bio}</p>
        )}

        {/* Details */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {prof.age && <span className="badge">Age: {prof.age}</span>}
          {Array.isArray(prof.interests) && prof.interests.length > 0 && prof.interests.map((tag, i) => (
            <span key={i} className="badge">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  )
}





