// src/pages/AdminVerify.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AdminVerify() {
  const [me, setMe] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [rows, setRows] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setMe(user || null)
      if (!user) return
      const { data } = await supabase
        .from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
      setIsAdmin(!!data)
    })()
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    ;(async () => {
      const { data, error } = await supabase
        .from('verification_requests')
        .select('id, user_id, status, reason, created_at, reviewed_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (!error) {
        // enrich with profile basics
        const userIds = (data || []).map(r => r.user_id)
        if (userIds.length) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id, handle, display_name, avatar_url, is_verified')
            .in('user_id', userIds)
          const map = new Map((profs || []).map(p => [p.user_id, p]))
          setRows((data || []).map(r => ({ ...r, profile: map.get(r.user_id) || null })))
        } else setRows([])
      }
    })()
  }, [isAdmin])

  async function approve(r) {
    setBusyId(r.id); setMsg('')
    const now = new Date().toISOString()
    const { error: e1 } = await supabase
      .from('verification_requests')
      .update({ status: 'approved', reviewed_by: me.id, reviewed_at: now })
      .eq('id', r.id).eq('status','pending')
    if (e1) { setBusyId(null); setMsg(e1.message); return }
    const { error: e2 } = await supabase
      .from('profiles')
      .update({ is_verified: true, verified_at: now })
      .eq('user_id', r.user_id)
    setBusyId(null)
    if (e2) { setMsg(e2.message) }
    else setRows(rows.filter(x => x.id !== r.id))
  }

  async function reject(r) {
    setBusyId(r.id); setMsg('')
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('verification_requests')
      .update({ status: 'rejected', reviewed_by: me.id, reviewed_at: now })
      .eq('id', r.id).eq('status','pending')
    setBusyId(null)
    if (error) setMsg(error.message)
    else setRows(rows.filter(x => x.id !== r.id))
  }

  if (!me) return <div className="container" style={{ padding:24 }}><div className="muted">Checking sign-in…</div></div>
  if (!isAdmin) return <div className="container" style={{ padding:24 }}><div className="muted">Not authorized.</div></div>

  return (
    <div className="container" style={{ padding:24, maxWidth:900 }}>
      <h1 style={{ fontWeight:900, marginBottom:12 }}>Verification Requests</h1>
      {msg && <div className="helper-muted" style={{ marginBottom:12, color:'#b91c1c' }}>{msg}</div>}
      {!rows.length && <div className="muted">No pending requests.</div>}

      <div style={{ display:'grid', gap:12 }}>
        {rows.map(r => (
          <div key={r.id} style={{
            display:'grid', gridTemplateColumns:'56px 1fr auto', gap:12,
            alignItems:'center', border:'1px solid var(--border)', borderRadius:12, padding:12, background:'#fff'
          }}>
            <div style={{ width:56, height:56, borderRadius:'50%', overflow:'hidden', border:'1px solid var(--border)', background:'#f8fafc' }}>
              <img alt="" src={r.profile?.avatar_url || '/logo-mark.png'} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            </div>
            <div>
              <div style={{ fontWeight:800 }}>
                {r.profile?.display_name || r.profile?.handle || r.user_id}
              </div>
              <div className="helper-muted">Requested: {new Date(r.created_at).toLocaleString()}</div>
              {r.reason && <div className="helper-muted">Reason: {r.reason}</div>}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" disabled={busyId===r.id} onClick={() => approve(r)}>
                {busyId===r.id ? 'Working…' : 'Approve'}
              </button>
              <button className="btn btn-neutral" disabled={busyId===r.id} onClick={() => reject(r)}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
