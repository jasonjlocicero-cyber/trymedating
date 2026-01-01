// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function PublicProfile() {
  const { handle } = useParams()
  const location = useLocation()

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [profile, setProfile] = useState(null)
  const [photos, setPhotos] = useState([])

  // If we navigated here from Connections, show a "Back to connections" button
  const backTo = location?.state?.from === 'connections' ? '/connections' : '/'
  const backLabel = location?.state?.from === 'connections' ? 'Back to connections' : 'Back home'

  useEffect(() => {
    let mounted = true

    ;(async () => {
      setLoading(true)
      setErr('')
      setProfile(null)
      setPhotos([])

      try {
        // 1) Load profile by handle (IMPORTANT: include user_id)
        const { data: p, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, handle, display_name, bio, avatar_url, is_public')
          .eq('handle', handle)
          .maybeSingle()

        if (pErr) throw pErr
        if (!p || !p.is_public) {
          if (mounted) setProfile(null)
          return
        }
        if (mounted) setProfile(p)

        // 2) Load public photos by user_id (NOT handle)
        const { data: rows, error: rErr } = await supabase
          .from('profile_photos')
          .select('id, path, caption, sort_order')
          .eq('user_id', p.user_id)
          .eq('show_on_public', true)
          .order('sort_order', { ascending: true })

        if (rErr) throw rErr

        const list = rows || []
        if (!list.length) {
          if (mounted) setPhotos([])
          return
        }

        // 3) Signed URLs (works even if the bucket is private)
        const paths = list.map((x) => x.path)
        const { data: signed, error: sErr } = await supabase.storage
          .from('profile-photos')
          .createSignedUrls(paths, 60 * 60) // 1 hour

        if (sErr) throw sErr

        const signedByPath = Object.fromEntries(
          (signed || [])
            .filter((x) => x?.signedUrl && x?.path)
            .map((x) => [x.path, x.signedUrl])
        )

        const merged = list
          .map((x) => ({ ...x, url: signedByPath[x.path] || '' }))
          .filter((x) => !!x.url)

        if (mounted) setPhotos(merged)
      } catch (e) {
        if (mounted) setErr(e?.message || 'Failed to load public profile')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [handle])

  return (
    <div className="container" style={{ padding: '28px 0', maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontWeight: 900, margin: 0 }}>Profile</h1>
        <Link className="btn btn-neutral btn-pill" to={backTo}>
          {backLabel}
        </Link>
      </div>

      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading…</div>}
      {err && <div className="helper-error" style={{ marginTop: 12 }}>{err}</div>}

      {!loading && !profile && !err && (
        <div className="muted" style={{ marginTop: 12 }}>
          This profile isn’t public (or doesn’t exist).
        </div>
      )}

      {!loading && profile && (
        <>
          <div
            style={{
              marginTop: 16,
              background: '#fff',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 14,
              padding: 18,
              display: 'flex',
              gap: 14,
              alignItems: 'center'
            }}
          >
            <div className="avatar-frame" style={{ width: 56, height: 56 }}>
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                />
              ) : (
                <div className="avatar-initials">
                  {(profile.display_name || profile.handle || 'U').slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>{profile.display_name || profile.handle}</div>
              <div className="muted">@{profile.handle}</div>
              {profile.bio ? <div style={{ marginTop: 6 }}>{profile.bio}</div> : null}
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <h2 style={{ fontWeight: 900, marginBottom: 8 }}>Photos</h2>

            {photos.length === 0 ? (
              <div className="muted">No public photos yet.</div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 12
                }}
              >
                {photos.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 14,
                      overflow: 'hidden',
                      background: '#fff'
                    }}
                  >
                    <img
                      src={p.url}
                      alt={p.caption || 'Photo'}
                      style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
                      loading="lazy"
                    />
                    {p.caption ? (
                      <div style={{ padding: 10, fontSize: 13 }} className="muted">
                        {p.caption}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}























