// src/components/UserBadge.jsx
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function UserBadge() {
  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) return
      setMe(user)

      const { data } = await supabase
        .from('profiles')
        .select('handle, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle()

      if (alive) setProfile(data || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s?.user) { setMe(null); setProfile(null) }
      else setMe(s.user)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  if (!me || !profile) return null

  return (
    <Link to="/profile" style={{
      display: 'flex', alignItems: 'center', gap: 8,
      textDecoration: 'none', fontWeight: 600
    }}>
      <img
        src={profile.avatar_url || 'https://via.placeholder.com/32?text=%F0%9F%91%A4'}
        alt="avatar"
        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
      />
      <span style={{ color: 'var(--primary)' }}>@{profile.handle}</span>
    </Link>
  )
}
