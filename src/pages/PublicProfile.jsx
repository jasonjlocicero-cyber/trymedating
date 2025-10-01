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
        // current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!cancel) setMe(user || null)

        // fetch profile by handle (no public filter yet)
        const { data, error } = await supabase
          .from('profiles')
          .select('user_id, display_name, handle, bio, public_profile, avatar_url')
          .eq('handle', handle)
          .maybeSingle()
        if (error) throw error
        if (!cancel) setProfile(data || null)

        // If both sides known, check block either direction
        const targetId = data?.user_id
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

  const targetUserId = profile.user_id
  const isMe = me?.id && me.id === targetUserId
  const visibleToViewer = isMe || !!profile.public_profile

  if (!visibleToViewer) {
    return (
      <div className="container" style={{ padding:24 }}>
        <h1>Private profile</h1>
        <p className="muted">This profile is private and not visible to the public.</p>
        {isMe ? (
          <Link to="/profile" className="btn">Edit my profile</Link>
        ) : (
          <Link to="/" className="btn">Back home</Link>
        )}
      </div>
    )
  }

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

            {/* Messaging is intentionally removed on public profiles.
               If you re-add later, wrap with: !blockedEitherWay */}
            {/* {!isMe && !blockedEitherWay && <button className="btn btn-primary">Message</button>} */}

            {/* Block / Unblock */}
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







