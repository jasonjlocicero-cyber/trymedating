// src/pages/InviteQR.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'
import QRShareCard from '../components/QRShareCard'

export default function InviteQR() {
  const [me, setMe] = useState(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  // Bootstrap auth
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth?next=/invite', { replace: true }); return }
      if (!alive) return
      setMe(user)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [navigate])

  // Try to reuse/create an invite code, but never block rendering a QR
  useEffect(() => {
    if (!me?.id) return
    ;(async () => {
      try {
        setErr('')
        // 1) reuse
        const { data: existing, error: selErr } = await supabase
          .from('invite_codes')
          .select('code,status')
          .eq('owner', me.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()
        if (selErr) throw selErr
        if (existing?.code) { setCode(existing.code); return }

        // 2) create new
        const { data: created, error: insErr } = await supabase
          .from('invite_codes')
          .insert({ owner: me.id })
          .select('code')
          .single()
        if (insErr) throw insErr
        setCode(created.code)
      } catch (e) {
        // Don’t hide the QR if DB fails; we’ll fall back to a non-code link.
        setErr(e?.message || String(e))
      }
    })()
  }, [me?.id])

  // Fallback link if we don’t have a DB code
  const fallbackLink = me?.user_metadata?.handle
    ? `${window.location.origin}/u/${encodeURIComponent(me.user_metadata.handle)}?invite=${me?.id?.slice(0,8)}`
    : `${window.location.origin}/connect?from=${me?.id || ''}`

  const link = code ? `${window.location.origin}/connect?code=${code}` : fallbackLink

  return (
    <div className="container" style={{ padding: '32px 0', maxWidth: 720 }}>
      <h1 style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--secondary)' }}>Share</span>{' '}
        <span style={{ color: 'var(--primary)' }}>Your QR</span>
      </h1>

      {loading && <div className="card">Preparing your invite…</div>}

      {!loading && (
        <>
          <QRShareCard value={link} label={code ? 'Your invite QR' : 'Temporary QR'} />
          <details style={{ marginTop: 16 }}>
            <summary>Debug details</summary>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#fafafa', border: '1px solid var(--border)', padding: 12, borderRadius: 8 }}>
{JSON.stringify({ userId: me?.id, handle: me?.user_metadata?.handle, code, link, error: err }, null, 2)}
            </pre>
          </details>
        </>
      )}

      {err && (
        <div className="helper-error" style={{ marginTop: 12 }}>
          {err}
        </div>
      )}
    </div>
  )
}



