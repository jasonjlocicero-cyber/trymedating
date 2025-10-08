// src/routes/Connect.jsx
import React, { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

/**
 * Connect (QR handler)
 * - URL format: /connect?to=<recipientUserId>
 * - If signed in: upsert pending connection (requester = me.id, recipient = to)
 * - Shows current status (pending/accepted/rejected) with CTAs
 */
export default function Connect({ me }) {
  const [sp] = useSearchParams()
  const nav = useNavigate()

  const recipientId = useMemo(() => sp.get('to') || '', [sp])
  const authed = !!me?.id

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('unknown') // 'unknown' | 'invalid' | 'self' | 'none' | 'pending' | 'accepted' | 'rejected'
  const [errorText, setErrorText] = useState('')
  const [recipientHandle, setRecipientHandle] = useState(null) // optional: show who you're connecting to

  // Load current relationship status (if signed in and link valid)
  useEffect(() => {
    async function init() {
      setErrorText('')
      if (!recipientId) { setStatus('invalid'); return }
      if (!authed) { setStatus('none'); return }
      if (recipientId === me.id) { setStatus('self'); return }

      // Optional: fetch a public handle/display name to show
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('handle, display_name')
          .eq('id', recipientId)
          .maybeSingle()
        setRecipientHandle(prof?.display_name || prof?.handle || null)
      } catch {}

      // Check if a connection row already exists (either direction)
      const { data, error } = await supabase
        .from('connection_requests')
        .select('requester, recipient, status')
        .or(`and(requester.eq.${me.id},recipient.eq.${recipientId}),and(requester.eq.${recipientId},recipient.eq.${me.id})`)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        setErrorText(error.message || 'Failed to load status')
        setStatus('none')
        return
      }

      if (!data) { setStatus('none'); return }
      setStatus(data.status) // 'pending' | 'accepted' | 'rejected'
    }
    init()
  }, [recipientId, authed, me?.id])

  async function requestConnection() {
    if (!authed) {
      nav('/auth')
      return
    }
    if (!recipientId || recipientId === me.id) {
      setStatus(recipientId === me.id ? 'self' : 'invalid')
      return
    }
    setBusy(true)
    const { error } = await supabase
      .from('connection_requests')
      .upsert(
        { requester: me.id, recipient: recipientId, status: 'pending' },
        { onConflict: 'requester,recipient' }
      )
    setBusy(false)
    if (error) {
      setErrorText(error.message || 'Could not send request')
    } else {
      setStatus('pending')
    }
  }

  function goToMessages() {
    // If you have a chat opener globally (window.openChat), use it:
    if (window.openChat) window.openChat(recipientId, recipientHandle || '')
    nav('/')
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 680 }}>
      <h2 style={{ fontWeight: 800, marginBottom: 8 }}>Connect</h2>

      {/* Context / who you're connecting to */}
      {recipientHandle && (
        <div className="muted" style={{ marginBottom: 8 }}>
          You’re connecting with <strong>{recipientHandle}</strong>.
        </div>
      )}

      {/* Error or invalid states */}
      {status === 'invalid' && (
        <div className="muted" style={{ marginTop: 8 }}>
          This link is missing a valid <code>to</code> user id.
        </div>
      )}
      {status === 'self' && (
        <div className="muted" style={{ marginTop: 8 }}>
          You can’t connect with yourself.
        </div>
      )}
      {errorText && (
        <div className="muted" style={{ color: '#b91c1c', marginTop: 8 }}>
          {errorText}
        </div>
      )}

      {/* Main actions */}
      <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {status === 'accepted' ? (
          <>
            <span className="muted">You’re already connected! 🎉</span>
            <button className="btn btn-primary" onClick={goToMessages}>Open messages</button>
            <Link className="btn btn-neutral" to="/">Back home</Link>
          </>
        ) : status === 'pending' ? (
          <>
            <span className="muted">Request sent — waiting for acceptance.</span>
            <Link className="btn btn-neutral" to="/">Done</Link>
          </>
        ) : status === 'rejected' ? (
          <>
            <span className="muted">This request was declined.</span>
            <button className="btn btn-primary" onClick={requestConnection} disabled={busy}>
              {busy ? 'Sending…' : 'Send again'}
            </button>
            <Link className="btn btn-neutral" to="/">Back</Link>
          </>
        ) : status === 'none' || status === 'unknown' ? (
          <>
            {!authed && (
              <>
                <span className="muted">Please sign in to send a request.</span>
                <Link className="btn btn-primary" to="/auth">Sign in</Link>
              </>
            )}
            {authed && (
              <>
                <button className="btn btn-primary" onClick={requestConnection} disabled={busy || !recipientId}>
                  {busy ? 'Sending…' : 'Request to connect'}
                </button>
                <Link className="btn btn-neutral" to="/">Cancel</Link>
              </>
            )}
          </>
        ) : null}
      </div>

      {/* Small note */}
      <div className="muted" style={{ marginTop: 16 }}>
        After you send a request, the other person will see a popup to <strong>Accept</strong> or <strong>Decline</strong>.
      </div>
    </div>
  )
}
