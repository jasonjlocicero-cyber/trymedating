// src/pages/InviteQR.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function InviteQR() {
  const [me, setMe] = useState(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth?next=' + encodeURIComponent('/invite')); return }
      if (!alive) return
      setMe(user)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s?.user) navigate('/auth?next=' + encodeURIComponent('/invite'))
      setMe(s?.user || null)
    })
    return () => sub.subscription.unsubscribe()
  }, [navigate])

  useEffect(() => {
    if (!me?.id) return
    ;(async () => {
      setLoading(true); setError('')
      // Try to reuse an active code
      const { data: existing, error: selErr } = await supabase
        .from('invite_codes')
        .select('code')
        .eq('owner', me.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (selErr) setError(selErr.message)

      if (existing?.code) {
        setCode(existing.code)
      } else {
        // Create a fresh one
        const { data: created, error: insErr } = await supabase
          .from('invite_codes')
          .insert({ owner: me.id })
          .select('code')
          .single()
        if (insErr) setError(insErr.message)
        setCode(created?.code || '')
      }
      setLoading(false)
    })()
  }, [me?.id])

  const link = code ? `${window.location.origin}/connect?code=${code}` : ''
  const qrSrc = link
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`
    : ''

  return (
    <div className="container" style={{ padding: '32px 0' }}>
      <h1 style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--secondary)' }}>Share</span>{' '}
        <span style={{ color: 'var(--primary)' }}>Your QR</span>
      </h1>

      {loading && <div className="card">Preparing your invite…</div>}
      {error && <div className="card" style={{ borderColor: '#e11d48', color:'#e11d48' }}>{error}</div>}

      {!loading && !error && code && (
        <div className="card" style={{ display:'grid', justifyItems:'center', gap: 16 }}>
          <img src={qrSrc} alt="QR for invite" width={220} height={220} style={{ borderRadius: 12, border: '1px solid var(--border)' }} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Let them scan this to connect</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{link}</div>
          </div>
          <div style={{ display:'flex', gap: 12 }}>
            <a className="btn" href={link} target="_blank" rel="noreferrer">Open link</a>
            <button
              className="btn btn-primary"
              onClick={() => navigator.clipboard.writeText(link)}
            >
              Copy link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

