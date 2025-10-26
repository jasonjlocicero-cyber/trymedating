// src/pages/InviteQR.jsx
import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import QRShareCard from '../components/QRShareCard'

export default function InviteQR() {
  const [me, setMe] = useState(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  // ensure user is signed in
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/auth?next=' + encodeURIComponent('/invite'))
        return
      }
      if (!alive) return
      setMe(user)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session?.user) navigate('/auth?next=' + encodeURIComponent('/invite'))
      setMe(session?.user || null)
    })
    return () => sub?.subscription?.unsubscribe?.()
  }, [navigate])

  // load or create an active invite code
  useEffect(() => {
    if (!me?.id) return
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data: existing, error: selErr } = await supabase
          .from('invite_codes')
          .select('code')
          .eq('owner', me.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()

        if (selErr) throw selErr

        if (existing?.code) {
          setCode(existing.code)
        } else {
          const { data: created, error: insErr } = await supabase
            .from('invite_codes')
            .insert({ owner: me.id })
            .select('code')
            .single()
          if (insErr) throw insErr
          setCode(created?.code || '')
        }
      } catch (e) {
        setError(e.message || 'Failed to prepare your invite.')
      } finally {
        setLoading(false)
      }
    })()
  }, [me?.id])

  const inviteUrl = useMemo(
    () => (code ? `${window.location.origin}/connect?code=${code}` : ''),
    [code]
  )

  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 720 }}>
      <h1 style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--secondary)' }}>Share</span>{' '}
        <span style={{ color: 'var(--primary)' }}>Your QR</span>
      </h1>

      {loading && <div className="card">Preparing your invite…</div>}
      {error && (
        <div className="card" style={{ borderColor: '#e11d48', color: '#e11d48' }}>
          {error}
        </div>
      )}

      {!loading && !error && code && (
        <QRShareCard
          inviteUrl={inviteUrl}
          title="Let them scan this to request a connection"
          caption="You can copy or share the link below as well."
        />
      )}
    </div>
  )
}

