// src/components/ConnectionToast.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ConnectionToast
 * - Listens for new connection_requests where recipient = me.id
 * - Pops up a toast when someone scans your QR code and sends a request
 * - Provides Accept / Decline actions inline
 * - Automatically opens the chat bubble with that requester
 */
export default function ConnectionToast({ me }) {
  const [req, setReq] = useState(null)

  useEffect(() => {
    if (!me?.id) return

    // Realtime notify on new pending requests
    const ch = supabase
      .channel(`conn-requests-${me.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'connection_requests', filter: `recipient=eq.${me.id}` },
        payload => {
          const r = payload?.new
          if (r?.status === 'pending') {
            setReq(r)
            // Immediately open chat with the requester, so banner shows in the bubble
            if (window.openChat) window.openChat(r.requester)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'connection_requests', filter: `recipient=eq.${me.id}` },
        payload => {
          const r = payload?.new
          // Close toast on accept/reject
          if (r?.status === 'accepted' || r?.status === 'rejected') setReq(null)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [me?.id])

  async function acceptConnection() {
    if (!req) return
    const { error } = await supabase
      .from('connection_requests')
      .update({ status: 'accepted', decided_at: new Date().toISOString() })
      .eq('id', req.id)
    if (!error) setReq(null)
  }

  async function rejectConnection() {
    if (!req) return
    const { error } = await supabase
      .from('connection_requests')
      .update({ status: 'rejected', decided_at: new Date().toISOString() })
      .eq('id', req.id)
    if (!error) setReq(null)
  }

  if (!req) return null

  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 2000,
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 6px 18px rgba(0,0,0,0.1)',
        padding: '12px 16px',
        width: 320,
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}
    >
      <div style={{ fontWeight: 700 }}>
        New connection request
      </div>
      <div className="muted">
        Someone just scanned your QR code and wants to connect.
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-neutral" onClick={rejectConnection}>Decline</button>
        <button className="btn btn-primary" onClick={acceptConnection}>Accept</button>
      </div>
    </div>
  )
}

