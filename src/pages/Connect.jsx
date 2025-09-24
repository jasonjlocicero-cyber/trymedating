import React, { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Connect() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState('Checking invite…')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/auth?next=' + encodeURIComponent(window.location.pathname + window.location.search))
        return
      }
      const code = params.get('code')
      if (!code) { setError('Missing invite code'); setStatus(''); return }

      // Call RPC to consume and connect
      const { error: rpcErr } = await supabase.rpc('consume_invite_and_connect', { p_code: code })
      if (rpcErr) {
        setError(rpcErr.message || 'Could not connect with this invite')
        setStatus('')
      } else {
        setStatus('🎉 You’re connected!')
      }
    })()
    return () => { alive = false }
  }, [params, navigate])

  return (
    <div className="container" style={{ padding: '32px 0' }}>
      <h1 style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--secondary)' }}>Connect</span>{' '}
        <span style={{ color: 'var(--primary)' }}>Invite</span>
      </h1>

      {status && <div className="card">{status}</div>}
      {error && <div className="card" style={{ borderColor:'#e11d48', color:'#e11d48' }}>{error}</div>}

      {!error && status === '🎉 You’re connected!' && (
        <div className="card" style={{ display:'flex', gap:12 }}>
          <Link className="btn btn-primary" to="/network">Go to My Network</Link>
          <Link className="btn" to="/">Go Home</Link>
        </div>
      )}

      {error && (
        <div className="card" style={{ display:'flex', gap:12 }}>
          <Link className="btn" to="/">Go Home</Link>
        </div>
      )}
    </div>
  )
}
