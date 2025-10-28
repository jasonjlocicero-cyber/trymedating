// src/pages/InviteQR.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import QRShareCard from '../components/QRShareCard'

export default function InviteQR() {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth?next=' + encodeURIComponent('/invite')); return }
      if (!alive) return
      setMe(user); setLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session?.user) navigate('/auth?next=' + encodeURIComponent('/invite'))
      setMe(session?.user || null)
    })
    return () => sub?.subscription?.unsubscribe?.()
  }, [navigate])

  const inviteUrl = useMemo(
    () => (me?.id ? `${window.location.origin}/connect?uid=${me.id}` : ''),
    [me?.id]
  )

  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 720 }}>
      <h1 style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--secondary)' }}>Share</span>{' '}
        <span style={{ color: 'var(--primary)' }}>Your QR</span>
      </h1>

      {loading && <div className="card">Preparing your invite…</div>}

      {!loading && me?.id && (
        <QRShareCard
          inviteUrl={inviteUrl}
          title="Let them scan this to request a connection"
          caption="You can copy or share the link below as well."
        />
      )}
    </div>
  )
}


