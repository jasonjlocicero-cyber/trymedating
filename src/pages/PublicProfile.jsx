import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function PublicProfile() {
  const { handle } = useParams()
  const nav = useNavigate()
  const [viewer, setViewer] = useState(null)
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading') // loading | ok | notfound | error
  const [liked, setLiked] = useState(false)
  const [mutual, setMutual] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!supabase) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Profile</h2>
        <p>Supabase is not configured. Add env vars and redeploy.</p>
      </div>
    )
  }

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setViewer(user || null)
    })()
  }, [])

  // Fetch profile by handle (include user_id)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, handle, display_name, bio, mode, is_public, avatar_url')
        .eq('handle', handle)
        .maybeSingle()

      if (!alive) return
      if (error) { setState('error'); return }
      if (!data || data.is_public === false) { setState('notfound'); return }

      setData(data)
      setState('ok')
    })()
    return () => { alive = false }
  }, [handle])

  // Check like/mutual state
  useEffect(() => {
    if (!viewer || !data?.user_id) return
    let alive = true
    ;(async () => {
      const { data: myLike } = await supabase
        .from('likes').select('liker, likee')
        .eq('liker', viewer.id).eq('likee', data.user_id).maybeSingle()
      const { data: theirLike } = await supabase
        .from('likes').select('liker, likee')
        .eq('liker', data.user_id).eq('likee', viewer.id).maybeSingle()
      if (!alive) return
      setLiked(!!myLike)
      setMutual(!!myLike && !!theirLike)
    })()
    return () => { alive = false }
  }, [viewer, data?.user_id])

  async function doLike() {
    if (!viewer) { window.location.href = '/auth'; return }
    if (!data?.user_id || viewer.id === data.user_id) return
    setBusy(true); setErr('')
    try {
      const { error } = await supabase.from('likes').insert({ liker: viewer.id, likee: data.user_id })
      if (error && !String(error.message || '').includes('duplicate key')) throw error
      setLiked(true)
      const { data: theirLike } = await supabase
        .from('likes').select('liker, likee')
        .eq('liker', data.user_id).eq('likee', viewer.id).maybeSingle()
      setMutual(!!theirLike)
    } catch (e) {
      setErr(e.message || 'Could not like.')
    } finally {
      setBusy(false)
    }
  }

  async function doUnlike() {
    if (!viewer || !data?.user_id) return
    setBusy(true); setErr('')
    try {
      const { error } = await supabase
        .from('likes').delete()
        .eq('liker', viewer.id).eq('likee', data.user_id)
      if (error) throw error
      setLiked(false)
      setMutual(false)
    } catch (e) {
      setErr(e.message || 'Could not unlike.')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return <div style={{ padding: 40 }}>Loading…</div>
  if (state === 'notfound') return <div style={{ padding: 40 }}>This profile is private or does not exist.</div>
  if (state === 'error') return <div style={{ padding: 40 }}>Something went wrong.</div>

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

      {/* Actions: Like/Unlike + Message */}
      <div style={{ marginTop: 16, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        {viewer && viewer.id === data.user_id ? (
          <div style={{ fontSize:13, opacity:.7 }}>This is your profile.</div>
        ) : liked ? (
          <button onClick={doUnlike} disabled={busy}
            style={{ padding:'10px 14px', border:'1px solid #ddd', borderRadius:10, background:'#fff' }}>
            {busy ? 'Working…' : 'Unlike'}
          </button>
        ) : (
          <button onClick={doLike} disabled={busy}
            style={{ padding:'10px 14px', border:'none', borderRadius:10, background:'#2A9D8F', color:'#fff', fontWeight:700 }}>
            {busy ? 'Working…' : 'Like'}
          </button>
        )}

        <button
          onClick={() => mutual ? nav(`/messages/${encodeURIComponent(data.handle)}`) : alert('You can message after a mutual like.')}
          style={{ padding:'10px 14px', borderRadius:10, border:'1px solid #ddd', background:'#fff' }}
        >
          Message
        </button>

        {mutual && <span style={{ fontSize:13, color:'#2A9D8F' }}>It’s a match! 🎉 You can message now.</span>}
        {err && <span style={{ fontSize:13, color:'#C0392B' }}>{err}</span>}
      </div>

      <div style={{ marginTop: 16, fontSize: 13, opacity: 0.8 }}>
        This is a public profile. To hide it, the owner can turn off “Public profile” in settings.
      </div>
    </div>
  )
}


