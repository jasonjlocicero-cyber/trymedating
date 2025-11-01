// src/routes/Connect.jsx
import React, { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useNavigate, Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// Global opener used by ChatLauncher / ChatDock
function openChatWith(partnerId, partnerName = '') {
  if (window.openChat) return window.openChat(partnerId, partnerName)
  window.dispatchEvent(new CustomEvent('open-chat', { detail: { partnerId, partnerName } }))
}

function tryDecodeTokenCompat(token) {
  // legacy support: plain uuid or base64 '{"pid":"<uuid>"}'
  if (!token) return null
  if (/^[0-9a-f-]{8}-[0-9a-f-]{4}-[1-5][0-9a-f-]{3}-[89ab][0-9a-f-]{3}-[0-9a-f-]{12}$/i.test(token)) return token
  try { const json = JSON.parse(atob(token)); if (json?.pid) return json.pid } catch {}
  return null
}

export default function Connect({ me }) {
  const [sp] = useSearchParams()
  const { token: pathToken } = useParams()
  const nav = useNavigate()

  const qTo = sp.get('to')
  const qU  = sp.get('u')
  const qTok = sp.get('token') || pathToken || ''

  const authed = !!me?.id

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('unknown') // 'unknown' | 'invalid' | 'self' | 'none' | 'pending' | 'accepted' | 'rejected'
  const [errorText, setErrorText] = useState('')
  const [recipientId, setRecipientId] = useState('')   // resolved id
  const [recipientHandle, setRecipientHandle] = useState(null)
  const [message, setMessage] = useState('')

  // Resolve recipient:
  // 1) If token present: call redeem_invite (verifies & one-time)
  // 2) else: fall back to ?to / ?u / legacy token
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setErrorText('')
      if (qTok) {
        try {
          setBusy(true)
          const r = await fetch('/functions/v1/redeem_invite', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: qTok })
          })
          const json = await r.json()
          setBusy(false)
          if (!r.ok || !json?.pid) {
            setStatus('invalid')
            setErrorText(json?.error || 'Invalid or expired code')
            return
          }
          if (!cancelled) setRecipientId(json.pid)
          return
        } catch (e) {
          setBusy(false)
          setStatus('invalid'); setErrorText(e.message || 'Redeem failed'); return
        }
      }
      // fallback path
      const legacy = qTo || qU || tryDecodeTokenCompat(pathToken || '')
      if (!legacy) { setStatus('invalid'); return }
      setRecipientId(legacy)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qTok, qTo, qU, pathToken])

  // After we know recipientId, continue as before
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!recipientId) return
      if (!authed) { setStatus('none'); return }
      if (recipientId === me.id) { setStatus('self'); return }

      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('handle, display_name')
          .eq('user_id', recipientId)
          .maybeSingle()
        if (!cancelled) setRecipientHandle(prof?.display_name || prof?.handle || null)
      } catch {}

      // check existing relationship (either direction)
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
        // create pending and open chat
        const { error: insErr } = await supabase
          .from('connection_requests')
          .insert({ requester: me.id, recipient: recipientId, status: 'pending' })
        if (insErr && insErr.code !== '23505') {
          setErrorText(insErr.message || 'Could not send request'); setStatus('none'); return
        }
        setStatus('pending'); setMessage('Request sent — opening chat…')
        openChatWith(recipientId, recipientHandle || '')
        return
      }

      setStatus(data.status)
      openChatWith(recipientId, recipientHandle || '')
      if (data.status === 'pending') setMessage('Request is pending — check the chat to accept/reject.')
      if (data.status === 'accepted') setMessage('You are connected — chat is open.')
      if (data.status === 'rejected') setMessage('This request was declined.')
    })()
    return () => { cancelled = true }
  }, [recipientId, authed, me?.id])

  async function requestConnection() {
    if (!authed) { nav('/auth'); return }
    if (!recipientId || recipientId === me.id) {
      setStatus(recipientId === me.id ? 'self' : 'invalid'); return
    }
    setBusy(true)
    const { error } = await supabase
      .from('connection_requests')
      .insert({ requester: me.id, recipient: recipientId, status: 'pending' })
    setBusy(false)
    if (error && error.code !== '23505') {
      setErrorText(error.message || 'Could not send request')
    } else {
      setStatus('pending'); setMessage('Request sent — opening chat…')
      openChatWith(recipientId, recipientHandle || '')
    }
  }

  function goToMessages() {
    if (recipientId) openChatWith(recipientId, recipientHandle || '')
    nav('/')
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 680 }}>
      <h2 style={{ fontWeight: 800, marginBottom: 8 }}>Connect</h2>

      {recipientHandle && (
        <div className="muted" style={{ marginBottom: 8 }}>
          You’re connecting with <strong>{recipientHandle}</strong>.
        </div>
      )}

      {status === 'invalid' && (
        <div className="muted" style={{ marginTop: 8 }}>
          This code is invalid or expired.
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
            <button className="btn btn-primary" onClick={goToMessages}>Open messages</button>
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

      <div className="muted" style={{ marginTop: 16 }}>
        After you send a request, the other person will see a popup to <strong>Accept</strong> or <strong>Decline</strong>.
      </div>
    </div>
  )
}



