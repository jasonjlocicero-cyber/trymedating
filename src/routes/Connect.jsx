// src/routes/Connect.jsx
import React, { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useNavigate, Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

/**
 * Connect (QR handler)
 * Supported URL formats:
 *   • /connect?to=<recipientUserId>
 *   • /connect?u=<recipientUserId>
 *   • /connect/:token   (token may be a UUID, or b64 JSON like {"t":"tmdv1","pid":"<uuid>"})
 *
 * Behavior:
 *   • If signed in and link is valid: ensure/create a pending request (requester = me.id, recipient = target)
 *   • Opens the chat bubble focused on the recipient so Accept/Reject is visible
 *   • Shows current status (pending/accepted/rejected) with CTAs
 */

// Global opener used by ChatLauncher / ChatDock
function openChatWith(partnerId, partnerName = '') {
  if (window.openChat) return window.openChat(partnerId, partnerName)
  window.dispatchEvent(new CustomEvent('open-chat', { detail: { partnerId, partnerName } }))
}

// Decode UUID from plain token or base64 JSON token
function tryDecodeToken(token) {
  if (!token) return null
  // plain UUID?
  if (/^[0-9a-f-]{8}-[0-9a-f-]{4}-[1-5][0-9a-f-]{3}-[89ab][0-9a-f-]{3}-[0-9a-f-]{12}$/i.test(token)) {
    return token
  }
  // base64 JSON with { pid: "<uuid>" }
  try {
    const json = JSON.parse(atob(token))
    if (json && typeof json.pid === 'string') return json.pid
  } catch (_) {}
  return null
}

export default function Connect({ me }) {
  const [sp] = useSearchParams()
  const { token } = useParams()
  const nav = useNavigate()

  // Accept both ?to= and ?u= and /:token
  const recipientId = useMemo(() => {
    const byTo = sp.get('to')
    const byU = sp.get('u')
    return byTo || byU || tryDecodeToken(token) || ''
  }, [sp, token])

  const authed = !!me?.id

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('unknown') // 'unknown' | 'invalid' | 'self' | 'none' | 'pending' | 'accepted' | 'rejected'
  const [errorText, setErrorText] = useState('')
  const [recipientHandle, setRecipientHandle] = useState(null) // optional: show who you're connecting to
  const [message, setMessage] = useState('') // small inline status text

  // Load current relationship status (if signed in and link valid)
  useEffect(() => {
    let cancelled = false

    async function init() {
      setErrorText('')
      setMessage('')

      if (!recipientId) { setStatus('invalid'); return }

      // If not authed yet, show CTA; we won't auto-redirect here to avoid surprise
      if (!authed) { setStatus('none'); return }

      if (recipientId === me.id) { setStatus('self'); return }

      // Optional: fetch a public handle/display name to show
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('handle, display_name')
          .eq('user_id', recipientId) // adjust if your schema differs
          .maybeSingle()
        if (!cancelled) setRecipientHandle(prof?.display_name || prof?.handle || null)
      } catch {
        /* noop */
      }

      // Check if a connection row already exists (either direction)
      const { data, error } = await supabase
        .from('connection_requests')
        .select('requester, recipient, status')
        .or(`and(requester.eq.${me.id},recipient.eq.${recipientId}),and(requester.eq.${recipientId},recipient.eq.${me.id})`)
        .order('decided_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return

      if (error && error.code !== 'PGRST116') {
        setErrorText(error.message || 'Failed to load status')
        setStatus('none')
        return
      }

      if (!data) {
        // No prior row — create pending and open chat
        setStatus('none')
        setBusy(true)
        const { error: insErr } = await supabase
          .from('connection_requests')
          .insert({ requester: me.id, recipient: recipientId, status: 'pending' })
        setBusy(false)

        if (insErr) {
          // Duplicate pending request across either direction
          if (insErr.code === '23505') {
            setStatus('pending')
            setMessage('Request already pending — opening chat…')
            openChatWith(recipientId, recipientHandle || '')
            return
          }
          // Guard/trigger-based rate limit (raised as exception)
          if (insErr.code === 'P0001' && /rate_limit/i.test(insErr.message || '')) {
            setErrorText('You’re sending requests too quickly. Please wait a few minutes and try again.')
            return
          }
          setErrorText(insErr.message || 'Could not send request')
          return
        }

        setStatus('pending')
        setMessage('Request sent — opening chat…')
        openChatWith(recipientId, recipientHandle || '')
        return
      }

      // There is an existing row
      setStatus(data.status) // 'pending' | 'accepted' | 'rejected'

      // Regardless of status, open the chat so Accept/Reject is visible (or messages if accepted)
      openChatWith(recipientId, recipientHandle || '')
      if (data.status === 'pending') setMessage('Request is pending — check the chat to accept/reject.')
      if (data.status === 'accepted') setMessage('You are connected — chat is open.')
      if (data.status === 'rejected') setMessage('This request was declined.')
    }

    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      .insert({ requester: me.id, recipient: recipientId, status: 'pending' })
    setBusy(false)

    if (error) {
      if (error.code === '23505') {
        setStatus('pending')
        setMessage('Request already pending — opening chat…')
        openChatWith(recipientId, recipientHandle || '')
        return
      }
      if (error.code === 'P0001' && /rate_limit/i.test(error.message || '')) {
        setErrorText('You’re sending requests too quickly. Please wait a few minutes and try again.')
        return
      }
      setErrorText(error.message || 'Could not send request')
      return
    }

    setStatus('pending')
    setMessage('Request sent — opening chat…')
    openChatWith(recipientId, recipientHandle || '')
  }

  function goToMessages() {
    if (recipientId) openChatWith(recipientId, recipientHandle || '')
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
          This link is missing a valid <code>to</code>/<code>u</code> user id or token.
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
      {message && !errorText && (
        <div className="muted" style={{ marginTop: 8 }}>
          {message}
        </div>
      )}

      {/* Main actions */}
      <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {status === 'accepted' ? (
          <>
            <span className="muted">You’re already connected! 🎉</span>
            <button className="btn btn-primary btn-pill" onClick={goToMessages}>Open messages</button>
            <Link className="btn btn-neutral btn-pill" to="/">Back home</Link>
          </>
        ) : status === 'pending' ? (
          <>
            <span className="muted">Request sent — waiting for acceptance.</span>
            <button className="btn btn-primary btn-pill" onClick={goToMessages}>Open messages</button>
            <Link className="btn btn-neutral btn-pill" to="/">Done</Link>
          </>
        ) : status === 'rejected' ? (
          <>
            <span className="muted">This request was declined.</span>
            <button className="btn btn-primary btn-pill" onClick={requestConnection} disabled={busy}>
              {busy ? 'Sending…' : 'Send again'}
            </button>
            <Link className="btn btn-neutral btn-pill" to="/">Back</Link>
          </>
        ) : status === 'none' || status === 'unknown' ? (
          <>
            {!authed && (
              <>
                <span className="muted">Please sign in to send a request.</span>
                <Link className="btn btn-primary btn-pill" to="/auth">Sign in</Link>
              </>
            )}
            {authed && (
              <>
                <button className="btn btn-primary btn-pill" onClick={requestConnection} disabled={busy || !recipientId}>
                  {busy ? 'Sending…' : 'Request to connect'}
                </button>
                <Link className="btn btn-neutral btn-pill" to="/">Cancel</Link>
              </>
            )}
          </>
        ) : null}
      </div>

      {/* Small note */}
      <div className="muted" style={{ marginTop: 16 }}>
        After you send a request, the other person will see a popup to <strong>Accept</strong> or <strong>Decline</strong>.
        The chat bubble will open automatically so you can decide right away.
      </div>
    </div>
  )
}



