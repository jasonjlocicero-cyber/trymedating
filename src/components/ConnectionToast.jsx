// src/components/ConnectionToast.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ConnectionToast({ me }) {
  const [req, setReq] = useState(null) // { id, requester }

  useEffect(() => {
    if (!me?.id) return

    // Load the latest pending (in case they had one already)
    let cancel = false
    async function load() {
      const { data } = await supabase
        .from('connection_requests')
        .select('id, requester, recipient, status, created_at')
        .eq('recipient', me.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
      if (!cancel) setReq(data?.[0] || null)
    }
    load()

    // Realtime: notify when a new pending row arrives for me
    const ch = supabase
      .channel(`conn-requests-${me.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'connection_requests', filter: `recipient=eq.${me.id}` },
        payload => {
          const r = payload.new
          if (r.status === 'pending') setReq(r)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch); cancel = true }
  }, [me?.id])

  if (!me?.id || !req) return null

  async function accept() {
    const { error } = await supabase
      .from('connection_requests')
      .update({ status: 'accepted', decided_at: new Date().toISOString() })
      .eq('id', req.id)
    if (!error) setReq(null)
    else alert(error.message)
  }

  async function reject() {
    const { error } = await supabase
      .from('connection_requests')
      .update({ status: 'rejected', decided_at: new Date().toISOString() })
      .eq('id', req.id)
    if (!error) setReq(null)
    else alert(error.message)
  }

  return (
    <div
      style={{
        position:'fixed', right:16, bottom:16,
        background:'#fff', border:'1px solid var(--border)', borderRadius:12,
        boxShadow:'0 10px 26px rgba(0,0,0,0.15)', padding:12, zIndex: 1100,
        width: 320, maxWidth: 'calc(100vw - 32px)'
      }}
      role="dialog" aria-live="polite"
    >
      <div style={{ fontWeight:800, marginBottom:4 }}>New connection request</div>
      <div className="muted" style={{ marginBottom:10 }}>
        A user wants to connect and chat with you.
      </div>
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button className="btn btn-neutral" onClick={reject}>Reject</button>
        <button className="btn btn-primary" onClick={accept}>Accept</button>
      </div>
    </div>
  )
}
