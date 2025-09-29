// src/components/ProfileHoverCard.jsx
import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Preview a user's profile on hover/tap.
 * Props:
 * - userId?: string
 * - handle?: string
 * - anchorRect: DOMRect|null
 * - open: boolean
 * - onClose: () => void
 */
export default function ProfileHoverCard({ userId, handle, anchorRect, open, onClose }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [profile, setProfile] = useState(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    let cancel = false
    ;(async () => {
      setLoading(true); setErr('')
      try {
        let q = supabase.from('profiles')
          .select('user_id, handle, display_name, bio, location, avatar_url, interests, public_profile')
        q = userId ? q.eq('user_id', userId) : q.eq('handle', handle)
        const { data, error } = await q.maybeSingle()
        if (error) throw error
        if (!cancel) setProfile(data || null)
      } catch (e) {
        if (!cancel) setErr(e.message || 'Failed to load profile')
      } finally { if (!cancel) setLoading(false) }
    })()
    return () => { cancel = true }
  }, [open, userId, handle])

  useEffect(() => {
    function onDoc(e) {
      if (!open) return
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose?.()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [open, onClose])

  if (!open || !anchorRect) return null

  const left = Math.min(Math.max(12, anchorRect.left), window.innerWidth - 320)
  const top = Math.max(12, anchorRect.bottom + 6)

  return (
    <div
      ref={wrapRef}
      style={{
        position:'fixed', left, top, width:300, zIndex:70,
        background:'#fff', border:'1px solid var(--border)', borderRadius:12,
        boxShadow:'0 14px 40px rgba(0,0,0,0.18)', padding:10
      }}
    >
      {loading && <div className="muted">Loading…</div>}
      {err && <div style={{ color:'#b91c1c' }}>{err}</div>}
      {!loading && !err && profile && (
        <div style={{ display:'grid', gap:8 }}>
          <div style={{ display:'flex', gap:10 }}>
            <div style={{
              width:48, height:48, borderRadius:10,
              background: profile.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : '#f1f5f9',
              border:'1px solid var(--border)'
            }} />
            <div style={{ minWidth:0 }}>
              <div style={{ fontWeight:800, fontSize:16, lineHeight:1.1 }}>
                {profile.display_name || profile.handle}
              </div>
              <div className="muted" style={{ fontSize:12, lineHeight:1.2 }}>
                @{profile.handle}{profile.location ? ` • ${profile.location}` : ''}
              </div>
            </div>
          </div>

          {profile.bio && (
            <div style={{
              fontSize:13, color:'#111', lineHeight:1.4,
              background:'#fafafa', border:'1px solid var(--border)', borderRadius:8, padding:'6px 8px'
            }}>
              {profile.bio.length > 160 ? profile.bio.slice(0,160)+'…' : profile.bio}
            </div>
          )}

          {Array.isArray(profile.interests) && profile.interests.length > 0 && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {profile.interests.slice(0,6).map(tag => (
                <span key={tag} style={{
                  fontSize:12, padding:'2px 8px', borderRadius:999,
                  border:'1px solid var(--border)', background:'#fff'
                }}>
                  {tag}
                </span>
              ))}
              {profile.interests.length > 6 && (
                <span className="muted" style={{ fontSize:12 }}>+{profile.interests.length - 6} more</span>
              )}
            </div>
          )}

          {profile.public_profile && (
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <a href={`/u/${profile.handle}`} className="btn" style={{ textDecoration:'none' }}>View</a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
