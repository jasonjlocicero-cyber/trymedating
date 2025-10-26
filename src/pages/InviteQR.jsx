// src/pages/InviteQR.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function InviteQR() {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [useAltHost, setUseAltHost] = useState(false)
  const navigate = useNavigate()

  // Ensure user is signed in
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          navigate('/auth?next=' + encodeURIComponent('/invite'))
          return
        }
        if (!alive) return
        setMe(user)
      } catch (e) {
        setErr(e.message || 'Could not load user.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session?.user) navigate('/auth?next=' + encodeURIComponent('/invite'))
      setMe(session?.user || null)
    })
    return () => sub?.subscription?.unsubscribe?.()
  }, [navigate])

  // Build the invite link straight from the user id (no DB needed)
  const inviteUrl = useMemo(() => (
    me?.id ? `${window.location.origin}/connect?uid=${me.id}` : ''
  ), [me?.id])

  // Primary & fallback QR image URLs (no dependencies)
  const qrUrl = useMemo(() => {
    if (!inviteUrl) return ''
    return useAltHost
      ? `https://quickchart.io/qr?size=220&text=${encodeURIComponent(inviteUrl)}`
      : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(inviteUrl)}`
  }, [inviteUrl, useAltHost])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      alert('Invite link copied!')
    } catch {
      alert(inviteUrl)
    }
  }

  const shareLink = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'TryMeDating invite', url: inviteUrl }) } catch {}
    } else {
      copyLink()
    }
  }

  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 720 }}>
      <h1 style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--secondary)' }}>Share</span>{' '}
        <span style={{ color: 'var(--primary)' }}>Your QR</span>
      </h1>

      {loading && <div className="card">Preparing your invite…</div>}
      {err && (
        <div className="card" style={{ borderColor: '#e11d48', color: '#e11d48' }}>
          {err}
        </div>
      )}

      {!loading && !err && inviteUrl && (
        <div className="card" style={{ display: 'grid', justifyItems: 'center', gap: 16 }}>
          <img
            src={qrUrl}
            alt="Invite QR"
            width={220}
            height={220}
            style={{ borderRadius: 12, border: '1px solid var(--border)' }}
            onError={() => setUseAltHost(true)}
          />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Let them scan this to connect</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all', maxWidth: 520 }}>
              {inviteUrl}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <a className="btn" href={inviteUrl} target="_blank" rel="noreferrer">Open link</a>
            <button className="btn btn-primary" type="button" onClick={copyLink}>Copy link</button>
            <button className="btn btn-neutral" type="button" onClick={shareLink}>Share</button>
          </div>
        </div>
      )}
    </div>
  )
}


