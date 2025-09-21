import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function PublicProfile() {
  const { handle } = useParams()
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading') // loading | ok | notfound | error

  // If Supabase isn't configured, show a friendly message
  if (!supabase) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Profile</h2>
        <p>Supabase is not configured. Add env vars and redeploy.</p>
      </div>
    )
  }

  // Update document title when handle changes
  useEffect(() => {
    document.title = `${handle} • TryMeDating`
  }, [handle])

  // Fetch profile from Supabase by handle
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('handle, display_name, bio, mode, is_public, avatar_url')
        .eq('handle', handle)
        .maybeSingle()

      if (!alive) return
      if (error) {
        setState('error')
        return
      }
      if (!data || data.is_public === false) {
        setState('notfound')
        return
      }

      setData(data)
      setState('ok')
    })()
    return () => { alive = false }
  }, [handle])

  // Loading / error / not found states
  if (state === 'loading') return <div style={{ padding: 40 }}>Loading…</div>
  if (state === 'notfound') return <div style={{ padding: 40 }}>This profile is private or does not exist.</div>
  if (state === 'error') return <div style={{ padding: 40 }}>Something went wrong.</div>

  // Render profile
  return (
    <div style={{ padding: 40, maxWidth: 720, margin: '0 auto', fontFamily: 'ui-sans-serif, system-ui' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <img
          src={data.avatar_url || 'https://via.placeholder.com/96?text=%F0%9F%98%8A'}
          alt={`${data.display_name} avatar`}
          style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee' }}
        />
        <div>
          <h2 style={{ margin: 0 }}>{data.display_name}</h2>
          <div style={{ opacity: 0.8 }}>@{data.handle} · {data.mode}</div>
        </div>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 16 }}>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{data.bio}</p>
      </div>

      <div style={{ marginTop: 16, fontSize: 13, opacity: 0.8 }}>
        This is a public profile. To hide it, the owner can turn off “Public profile” in settings.
      </div>
    </div>
  )
}


