// src/pages/AdminReports.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'

export default function AdminReports() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      setLoading(true); setErr('')
      try {
        const { data, error } = await supabase
          .from('reports')
          .select(`
            id, reason, details, status, created_at,
            reporter:reporter_id(display_name, handle),
            reported:reported_user_id(display_name, handle)
          `)
          .order('created_at', { ascending: false })
        if (error) throw error
        if (!cancel) setReports(data || [])
      } catch (e) {
        if (!cancel) setErr(e.message)
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [])

  return (
    <div className="container" style={{ padding:24 }}>
      <h1>Admin Reports Dashboard</h1>

      {err && <div style={{ color:'#b91c1c' }}>{err}</div>}
      {loading && <p>Loading…</p>}

      {!loading && reports.length === 0 && (
        <p className="muted">No reports found.</p>
      )}

      <div style={{ display:'grid', gap:12, marginTop:12 }}>
        {reports.map(r => (
          <div key={r.id} className="card" style={{ padding:12 }}>
            <div><strong>Reason:</strong> {r.reason}</div>
            {r.details && <div><strong>Details:</strong> {r.details}</div>}
            <div><strong>Status:</strong> {r.status}</div>
            <div><strong>Reported by:</strong> {r.reporter?.display_name || r.reporter?.handle}</div>
            <div><strong>Reported user:</strong> {r.reported?.display_name || r.reported?.handle}</div>
            <div className="muted" style={{ fontSize:12 }}>
              {new Date(r.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop:20 }}>
        <Link to="/" className="btn">Back home</Link>
      </div>
    </div>
  )
}
