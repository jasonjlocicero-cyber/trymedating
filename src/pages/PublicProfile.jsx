import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function PublicProfile(){
  const { handle } = useParams()
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading') // 'loading' | 'ok' | 'notfound' | 'error'

  // Guard if Supabase isn’t configured
  if (!supabase) {
    return (
      <div style={{padding:40}}>
        <h2>Profile</h2>
        <p>Supabase is not configured. Add env vars and redeploy.</p>
      </div>
    )
  }

  useEffect(() => {
    async function load(){
      const { data, error } = await supabase
        .from('profiles')
        .select('handle, display_name, bio, mode, is_public')
        .eq('handle', handle)
        .maybeSingle()
      if (error) return setState('error')
      if (!data || data.is_public === false) return setState('notfound')
      setData(data)
      setState('ok')
    }
    load()
  }, [handle])

  if (state === 'loading') {
    return <div style={{padding:40}}><div>Loading…</div></div>
  }
  if (state === 'notfound') {
    return <div style={{padding:40}}><div>This profile is private or does not exist.</div></div>
  }
  if (state === 'error') {
    return <div style={{padding:40}}><div>Something went wrong loading this profile.</div></div>
  }

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
