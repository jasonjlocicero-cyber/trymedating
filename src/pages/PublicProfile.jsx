import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function PublicProfile(){
  const { handle } = useParams()
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading') // loading | ok | notfound | error

  if (!supabase) {
    return (
      <div style={{padding:40}}>
        <h2>Profile</h2>
        <p>Supabase is not configured. Add env vars and redeploy.</p>
      </div>
    )
  }

  useEffect(() => {
    document.title = `${handle} • TryMeDating`
  }, [handle])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('handle, display_name, bio, mode, is_public')
        .eq('handle', handle)
        .maybeSingle()

      if (!alive) return
      if (error) { setState('error'); return }
      if (!data || data.is_public === false) { setState('notfound'); return }
      setData(data); setState('ok')
    })()
    return () => { alive = false }
  }, [handle])

  if (state === 'loading') return <div style={{padding:40}}>Loading…</div>
  if (state === 'notfound') return <div style={{padding:40}}>This profile is private or does not exist.</div>
  if (state === 'error') return <div style={{padding:40}}>Something went wrong.</div>

  return (
    <div style={{padding:40, maxWidth:720, fontFamily:'ui-sans-serif, system-ui'}}>
      <h2>{data.display_name}</h2>
      <div style={{opacity:.8, marginBottom:8}}>@{data.handle} · {data.mode}</div>
      <div style={{border:'1px solid #eee', borderRadius:8, padding:16}}>
        <p style={{whiteSpace:'pre-wrap'}}>{data.bio}</p>
      </div>
    </div>
  )
}
