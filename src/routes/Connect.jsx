// src/routes/Connect.jsx
import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Connect({ me }) {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const recipientId = sp.get('to')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!recipientId) setMsg('Invalid link.')
  }, [recipientId])

  async function requestConnection() {
    if (!me?.id) { setMsg('Please sign in.'); return }
    if (!recipientId || recipientId === me.id) { setMsg('Invalid recipient.'); return }
    setBusy(true)
    const { error } = await supabase
      .from('connection_requests')
      .upsert(
        { requester: me.id, recipient: recipientId, status: 'pending' },
        { onConflict: 'requester,recipient' }
      )
    setBusy(false)
    if (error) setMsg(error.message)
    else {
      setMsg('Request sent! They’ll be notified.')
      // (optional) navigate to their chat
      // nav(`/messages?with=${recipientId}`)
    }
  }

  return (
    <div className="container" style={{ padding: 24 }}>
      <h2>Connect</h2>
      <p>{msg || 'Send a connection request to this profile?'}</p>
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn btn-primary" onClick={requestConnection} disabled={busy || !recipientId}>
          {busy ? 'Sending…' : 'Request to connect'}
        </button>
        <button className="btn btn-neutral" onClick={() => nav(-1)}>Cancel</button>
      </div>
    </div>
  )
}
