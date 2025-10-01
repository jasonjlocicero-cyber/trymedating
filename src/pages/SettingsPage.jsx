// src/pages/SettingsPage.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function SettingsPage({ me }) {
  const authed = !!me?.id
  const [blocked, setBlocked] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    if (!authed) {
      setBlocked([])
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('blocks')
          .select('blocked_user_id, created_at, profiles!blocks_blocked_user_id_fkey(display_name, handle, avatar_url)')
          .eq('user_id', me.id)
        if (error) throw error
        if (!cancel) setBlocked(data || [])
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [authed, me?.id])

  async function handleUnblock(userId) {
    try {
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('user_id', me.id)
        .eq('blocked_user_id', userId)
      if (error) throw error
      setBlocked(prev => prev.filter(b => b.blocked_user_id !== userId))
    } catch (e) {
      alert(e.message || 'Could not unblock user')
    }
  }

  return (
    <div className="container" style={{ padding:24 }}>
      <h1>Settings</h1>

      {!authed && (
        <p className="muted">You must be signed in to manage settings.</p>
      )}

      {authed && (
        <div style={{ marginTop:24 }}>
          <h2 style={{ marginBottom:12 }}>Blocked users</h2>
          {loading && <p className="muted">Loading…</p>}
          {!loading && blocked.length === 0 && (
            <p className="muted">You haven’t blocked anyone.</p>
          )}
          {!loading && blocked.length > 0 && (
            <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:12 }}>
              {blocked.map(b => (
                <li key={b.blocked_user_id} className="card" style={{ padding:12, display:'flex', alignItems:'center', gap:12 }}>
                  <div
                    style={{
                      width:40, height:40, borderRadius:'50%',
                      background: b.profiles?.avatar_url
                        ? `url(${b.profiles.avatar_url}) center/cover no-repeat`
                        : '#f1f5f9',
                      border:'1px solid var(--border)'
                    }}
                  />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600 }}>
                      {b.profiles?.display_name || `@${b.profiles?.handle || 'user'}`}
                    </div>
                    <div className="muted" style={{ fontSize:12 }}>
                      @{b.profiles?.handle}
                    </div>
                  </div>
                  <button className="btn btn-secondary" onClick={() => handleUnblock(b.blocked_user_id)}>
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}





