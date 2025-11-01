// src/pages/InviteQR.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import QRShareCard from '../components/QRShareCard'
import { Link } from 'react-router-dom'

export default function InviteQR() {
  const [me, setMe] = useState(null)
  const [token, setToken] = useState('')
  const [exp, setExp] = useState(null) // seconds epoch
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const tickRef = useRef(null)

  // load me
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (alive) setMe(user || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setMe(s?.user || null))
    return () => sub?.subscription?.unsubscribe?.()
  }, [])

  const secondsLeft = useMemo(() => {
    if (!exp) return null
    const s = Math.max(0, exp - Math.floor(Date.now()/1000))
    return s
  }, [exp])

  const link = useMemo(() => {
    if (!token) return ''
    // IMPORTANT: we now use a signed token, to be redeemed by /redeem_invite
    return `${location.origin}/connect?token=${encodeURIComponent(token)}`
  }, [token])

  async function mintNow() {
    setBusy(true); setErr('')
    try {
      const at = (await supabase.auth.getSession()).data.session?.access_token ?? ''
      const r = await fetch('/functions/v1/mint_invite', { headers: { Authorization: `Bearer ${at}` } })
      const json = await r.json()
      if (!r.ok) throw new Error(json?.error || 'Mint failed')
      setToken(json.token)
      setExp(json.exp)
    } catch (e) {
      setErr(e.message || 'Mint failed')
    } finally {
      setBusy(false)
    }
  }

  // initial mint + auto refresh ~10s before expiry
  useEffect(() => {
    mintNow()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (!exp) return
    tickRef.current = setInterval(() => {
      const sLeft = exp - Math.floor(Date.now()/1000)
      if (sLeft <= 10) {
        // proactively refresh once
        clearInterval(tickRef.current)
        mintNow()
      }
    }, 1000)
    return () => clearInterval(tickRef.current)
  }, [exp])

  return (
    <div className="container" style={{ maxWidth: 760, padding: '28px 0' }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite QR</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Show this code to someone you met. It expires in {secondsLeft != null ? `${Math.floor(secondsLeft/60)
          .toString().padStart(1,'0')}:${(secondsLeft%60).toString().padStart(2,'0')}` : '—'} and can only be used once.
      </p>

      {err && <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 260, justifySelf: 'center' }}>
          <QRShareCard link={link} title="Scan to connect" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-pill" onClick={mintNow} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh code'}
        </button>
        {me?.user_metadata?.handle && (
          <Link to={`/u/${me.user_metadata.handle}`} className="btn btn-neutral btn-pill">
            Public profile
          </Link>
        )}
      </div>
    </div>
  )
}











