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
      try {
        // Current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!cancel) setMe(user || null)

        // Public profile by handle
        const { data, error } = await supabase
          .from('profiles')
          .select('id, user_id, display_name, handle, bio, public_profile, avatar_url')
          .eq('handle', handle)
          .eq('public_profile', true)
          .maybeSingle()
        if (error) throw error
        if (!cancel) setProfile(data || null)

        // Block state check (either direction), only if both sides known
        const targetId = data?.user_id ?? data?.id // support either column name
        if (user?.id && targetId) {
          const [{ data: b1 }, { data: b2 }] = await Promise.all([
            supabase.from('blocks')
              .select('user_id')
              .eq('user_id', user.id)
              .eq('blocked_user_id', targetId)
              .maybeSingle(),
            supabase.from('blocks')
              .select('user_id')
              .eq('user_id', targetId)
              .eq('blocked_user_id', user.id)
              .maybeSingle()
          ])
          if (!cancel) setBlockedEitherWay(!!b1 || !!b2)
        } else {
          if (!cancel) setBlockedEitherWay(false)
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [handle])

  function handleBlockedChange(nowBlocked) {
    // Reflect immediate toggle; a fresh load will verify both directions
    setBlockedEitherWay(!!nowBlocked)
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

  const targetUserId = profile.user_id ?? profile.id
  const isMe = me?.id && me.id === targetUserId

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

            {/* You intentionally removed messaging from public profiles.
                If you reintroduce it later, guard with !blockedEitherWay. */}
            {/* {!isMe && !blockedEitherWay && <button className="btn btn-primary">Message</button>} */}

            {/* Block / Unblock (not visible on own profile) */}
            {!isMe && me?.id && (
              <BlockButton
                me={me}
                targetUserId={targetUserId}
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







