// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { openChat } from '../chat/openChat' // adjust path
import { Link } from "react-router-dom"

<button
  <Link className="btn btn-primary" to={`/chat/handle/${profile.handle}`}>Message</Link>
  onClick={() => openChat(user.id, user.display_name)}
>
  Message
</button>

export default function PublicProfile() {
  const { handle } = useParams()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      setLoading(true); setErr('')
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select(`
            display_name, handle, bio, avatar_url,
            location, birthdate, pronouns, interests, public_profile
          `)
          .eq('handle', handle)
          .maybeSingle()
        if (error) throw error
        if (!cancel) setProfile(data)
      } catch (e) {
        if (!cancel) setErr(e.message || 'Profile not found')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [handle])

  function calcAge(birthdate) {
    if (!birthdate) return ''
    const d = new Date(birthdate + 'T00:00:00')
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    let a = now.getFullYear() - d.getFullYear()
    const m = now.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
    if (a < 0 || a > 120) return ''
    return a
  }

  if (loading) return <div className="container"><p>Loading profile…</p></div>
  if (err || !profile || !profile.public_profile) {
    return <div className="container"><h1>Profile not found</h1><p>This user may be private or does not exist.</p></div>
  }

  const { display_name, bio, avatar_url, location, pronouns, birthdate, interests, handle: userHandle } = profile
  const age = calcAge(birthdate)

  return (
    <div className="container" style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      {/* Avatar + name */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        {avatar_url ? (
          <img
            src={avatar_url}
            alt={display_name || userHandle}
            style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }}
          />
        ) : (
          <div style={{
            width: 120, height: 120, borderRadius: '50%',
            background: '#ddd', display: 'flex', alignItems:'center', justifyContent:'center',
            margin: '0 auto', fontSize: 40, fontWeight: 700
          }}>
            {display_name?.[0] || userHandle?.[0]}
          </div>
        )}
        <h1 style={{ marginTop: 12 }}>{display_name || userHandle}</h1>
        <div className="muted">@{userHandle}</div>
      </div>

      {/* Pronouns, location, age */}
      <div style={{ textAlign: 'center', marginBottom: 16, color:'var(--text)' }}>
        {pronouns && <span style={{ marginRight: 8 }}>{pronouns}</span>}
        {location && <span style={{ marginRight: 8 }}>📍 {location}</span>}
        {age && <span>🎂 {age}</span>}
      </div>

      {/* Bio */}
      {bio && (
        <div style={{ marginBottom: 20, textAlign:'center', whiteSpace:'pre-line' }}>
          {bio}
        </div>
      )}

      {/* Interests as brand-colored tags */}
      {Array.isArray(interests) && interests.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Interests</h3>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {interests.map((tag, i) => (
              <span
                key={`${tag}-${i}`}
                className={`tag ${i % 2 === 0 ? 'tag--teal' : 'tag--coral'}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}







