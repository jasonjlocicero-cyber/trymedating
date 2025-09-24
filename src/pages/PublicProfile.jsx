import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function PublicProfile() {
  const { handle } = useParams()
  const navigate = useNavigate()

  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Load current auth user
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
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Load the public profile (case-insensitive handle match)
  useEffect(() => {
    if (!handle) return
    ;(async () => {
      setLoading(true); setError('')
      // Use ilike for case-insensitive match
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, avatar_url, bio, mode')
        .ilike('handle', handle) // <— case-insensitive
        .maybeSingle()

      if (error) setError(error.message)
      setProfile(data || null)
      setLoading(false)
    })()
  }, [handle])

  function openChat() {
    if (!profile?.handle) return
    if (!window.trymeChat) {
      alert('Messaging is not ready on this page yet. Try a hard refresh.')
      return
    }
    // If not signed in, go to auth first, then come back
    if (!me) {
      navigate('/auth?next=' + encodeURIComponent(`/u/${profile.handle}`))
      return
    }
    window.trymeChat.open({ handle: profile.handle })
  }

  const isMe = me?.id && profile?.user_id && me.id === profile.user_id

  return (
    <div className="container" style={{ padding: '32px 0' }}>
      {loading && <div className="card">Loading profile…</div>}

      {error && (
        <div className="card" style={{ borderColor: '#e11d48', color: '#e11d48' }}>
          {error}
        </div>
      )}

      {!loading && !profile && !error && (
        <div className="card">
          <h2>Profile not found</h2>
          <p>We couldn’t find <strong>@{handle}</strong>. Check the handle and try again.</p>
        </div>
      )}

      {profile && (
        <div className="card" style={{ display: 'grid', gap: 16 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <img
                src={profile.avatar_url || 'https://via.placeholder.com/96?text=%F0%9F%91%A4'}
                alt=""
                style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e5e7eb' }}
              />
              <div>
                <h1 style={{ margin: 0 }}>{profile.display_name || profile.handle}</h1>
                <div className="badge">@{profile.handle}</div>
              </div>
            </div>

            {/* Message button — always visible; disabled if it's you */}
            <button
              className="btn btn-primary"
              onClick={openChat}
              disabled={isMe}
              title={isMe ? 'You cannot message yourself' : 'Start a conversation'}
            >
              {isMe ? 'Message (disabled)' : 'Message'}
            </button>
          </div>

          {/* Bio */}
          <div>
            <h3>About</h3>
            <p style={{ marginTop: 8 }}>
              {profile.bio || 'This user hasn’t written a bio yet.'}
            </p>
          </div>

          {/* Meta */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge">Mode: {profile.mode || 'standard'}</span>
            {!me && <span className="badge">Sign in to send messages</span>}
          </div>
        </div>
      )}
    </div>
  )
}



