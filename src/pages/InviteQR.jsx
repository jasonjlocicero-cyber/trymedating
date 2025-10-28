// src/pages/InviteQR.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'
import QRShareCard from '../components/QRShareCard'
import QRCode from 'react-qr-code'

export default function InviteQR() {
  const [me, setMe] = useState(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [debug, setDebug] = useState({ step: 'init' })
  const navigate = useNavigate()

  // bootstrap auth
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user }, error: uerr } = await supabase.auth.getUser()
      if (uerr) setDebug((d) => ({ ...d, authError: uerr.message }))
      if (!user) { navigate('/auth?next=' + encodeURIComponent('/invite')); return }
      if (!alive) return
      setMe(user)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s?.user) navigate('/auth?next=' + encodeURIComponent('/invite'))
      setMe(s?.user || null)
    })
    return () => sub?.subscription?.unsubscribe?.()
  }, [navigate])

  // fetch or create invite code
  useEffect(() => {
    if (!me?.id) return
    refreshCode('mount')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  async function refreshCode(reason = 'manual') {
    setLoading(true); setError('')
    setDebug((d) => ({ ...d, step: 'select-existing', reason }))

    // 1) try existing
    const { data: existing, error: selErr } = await supabase
      .from('invite_codes')
      .select('code')
      .eq('owner', me.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (selErr) {
      setError(selErr.message)
      setDebug((d) => ({ ...d, selectError: selErr.message }))
      setLoading(false)
      return
    }

    // found one
    if (existing?.code) {
      setCode(existing.code)
      setDebug((d) => ({ ...d, step: 'existing-found', existing }))
      setLoading(false)
      return
    }

    // 2) none found -> create one
    setDebug((d) => ({ ...d, step: 'insert-new' }))
    const { data: created, error: insErr } = await supabase
      .from('invite_codes')
      .insert({ owner: me.id })
      .select('code')
      .single()

    if (insErr) {
      setError(insErr.message)
      setDebug((d) => ({ ...d, insertError: insErr.message }))
      setCode('') // keep empty
      setLoading(false)
      return
    }

    setCode(created?.code || '')
    setLoading(false)
  }

  // primary link
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const link = code ? `${origin}/connect?code=${code}` : ''

  // fallback "test QR" value for visual verification (no DB required)
  const fallbackTestValue = me?.id ? `test:${me.id.slice(0, 12)}` : 'test:anon'

  return (
    <div className="container" style={{ padding: '32px 0' }}>
      <h1 style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--secondary)' }}>Share</span>{' '}
        <span style={{ color: 'var(--primary)' }}>Your QR</span>
      </h1>

      {/* actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-neutral" onClick={() => refreshCode('refresh-click')}>Refresh code</button>
        <button
          className="btn"
          onClick={async () => {
            // attempts a fresh insert regardless of existing
            setLoading(true); setError('')
            setDebug((d) => ({ ...d, step: 'force-insert' }))
            const { data, error: e } = await supabase
              .from('invite_codes')
              .insert({ owner: me.id })
              .select('code')
              .single()
            if (e) {
              setError(e.message)
              setDebug((d) => ({ ...d, forceInsertError: e.message }))
              setLoading(false)
              return
            }
            setCode(data?.code || '')
            setLoading(false)
          }}
        >
          Force create new code
        </button>
      </div>

      {/* status */}
      {loading && <div className="card">Preparing your invite…</div>}
      {error && (
        <div className="card" style={{ borderColor: '#e11d48', color:'#e11d48' }}>
          {error}
        </div>
      )}

      {/* MAIN: render real link if present */}
      {!loading && !error && link && <QRShareCard link={link} />}

      {/* FALLBACK: if no link, still render a visible QR so we know the UI path works */}
      {!loading && !error && !link && (
        <div className="card" style={{ display:'grid', justifyItems:'center', gap: 12 }}>
          <div style={{ fontWeight: 700 }}>No DB code yet — showing test QR to verify rendering</div>
          <div
            style={{
              background: '#fff',
              padding: 12,
              borderRadius: 12,
              border: '1px solid var(--border)'
            }}
          >
            <QRCode value={fallbackTestValue} size={160} />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            If you can see this QR, the **component is fine**. The problem is **DB/RLS**.
            Use “Force create new code” above, or run the SQL I sent to create the table/policies.
          </div>
        </div>
      )}

      {/* Debug panel */}
      <div className="card" style={{ marginTop: 16, fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Debug</div>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
{JSON.stringify({ user: me?.id, code, link, error, debug }, null, 2)}
        </pre>
      </div>
    </div>
  )
}



