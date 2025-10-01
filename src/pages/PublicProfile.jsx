// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import BlockButton from '../components/BlockButton'

export default function PublicProfile() {
  const { handle } = useParams()
  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [blockedEitherWay, setBlockedEitherWay] = useState(false)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      // who am I?
      const { data: { user } } = await supabase.auth.getUser()
      if (!cancel) setMe(user || null)

      // load public profile by handle
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, handle, bio, public_profile, avatar_url')
        .eq('handle', handle)
        .eq('public_profile', true)
        .maybeSingle()
      if (error) throw error
      if (!cancel) setProfile(data || null)

      // if both known, check block (either direction)
      if (user?.id && data?.user_id) {
        const { data: b1 } = await supabase
          .from('blocks').select('user_id')
          .eq('user_id', user.id)
          .eq('blocked_user_id', data.user_id)
          .maybeSingle()
        const { data: b2 } = await supabase
          .from('blocks').select('user_id')
          .eq('user_id', data.user_id)
          .eq('blocked_user_id', user.id)
          .maybeSingle()
        if (!cancel) setBlockedEitherWay(!!b1 || !!b2)
      } else {
        if (!cancel) setBlockedEitherWay(false)
      }
    })().finally(() => { if (!cancel) setLoading(false) })

    return () => { cancel = true }
  }, [handle])

  function handleBlockedChange(nowBlocked) {
    // If I just blocked them (or unblocked), recompute flag
    if (!me?.id || !profile?.user_id) return
    setBlockedEitherWay(nowBlocked) // quick reflect; next page load will re-check both directions
  }

  if (loading) {
    return <div className="container" style={{ padding:24 }}>Loading…</div>
  }
  if (!profile) {
    return (
      <div className="container" style={{ padding:24 }}>
        <h1>Profile not found</h1>
        <p className="muted">This user may be private or does not exist.</p>
        <Link to="/" className="btn">Back home</Link>
      </div>
    )
  }

  const isMe = me?.id && me.id === profile.user_id

  return (
    <div className="container" style={{ padding:24, maxWidth:860 }}>
      <div className="card" style={{ padding:16, display:'grid', gridTemplateColumns:'96px 1fr', gap:16 }}>
        <div
          style={{
            width:96, height:96, borderRadius:'50%',
            background: profile.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : '#f1f5f9',
            border: '1px solid var(--border)'
          }}
        />
        <div style={{ display:'grid', gap:6 }}>
          <h1 style={{ margin:'0 0 2px 0' }}>
            {profile.display_name || `@${profile.handle}`}
          </h1>
          <div className="muted">@{profile.handle}</div>
          {profile.bio && <p style={{ marginTop:8 }}>{profile.bio}</p>}

          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
            <Link to="/" className="btn">Home</Link>
            {isMe && <Link to="/profile" className="btn">Edit my profile</Link>}

            {/* Hide any future "Message" button if blocked in either direction */}
            {/* {!isMe && !blockedEitherWay && <button className="btn btn-primary">Message</button>} */}

            {/* Block / Unblock */}
            {!isMe && me?.id && (
              <BlockButton
                me={me}
                targetUserId={profile.user_id}
                onBlockedChange={handleBlockedChange}
              />
            )}
          </div>

          {blockedEitherWay && (
            <div className="muted" style={{ marginTop:8, fontSize:12 }}>
              Messaging is disabled because one of you has blocked the other.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}






