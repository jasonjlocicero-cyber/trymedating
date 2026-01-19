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

        const paths = list.map((x) => x.path)
        const { data: signed, error: sErr } = await supabase.storage
          .from('profile-photos')
          .createSignedUrls(paths, 60 * 60)

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
      <style>{`
        /* Avatar: force a true square so it can NEVER become an oval */
        .pp-avatar {
          width: 56px;
          height: 56px;
          aspect-ratio: 1 / 1;
          border-radius: 9999px;
          overflow: hidden;
          background: #e5e7eb;
          flex-shrink: 0;
          display: grid;
          place-items: center;
        }
        .pp-avatar img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          object-position: center;
        }

        .pp-photos-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
        }

        .pp-photo-card {
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 14px;
          overflow: hidden;
          background: #fff;
        }

        /* Keep consistent tiles */
        .pp-photo-media {
          width: 100%;
          aspect-ratio: 1 / 1;
          background: #fff;
        }

        /* Default: desktop look (full bleed) */
        .pp-photo-img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover !important;
          object-position: center;
          background: #fff;
        }

        /* Mobile/touch: show the full photo (NO top/bottom cutoff) */
        @media (hover: none) and (pointer: coarse) {
          .pp-photo-img {
            object-fit: contain !important;
          }
        }
      `}</style>

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
            <div className="pp-avatar" aria-label="Avatar">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" />
              ) : (
                <div style={{ fontWeight: 900, color: '#1d4ed8' }}>
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
              <div className="pp-photos-grid">
                {photos.map((p) => (
                  <div key={p.id} className="pp-photo-card">
                    <div className="pp-photo-media">
                      <img
                        src={p.url}
                        alt={p.caption || 'Photo'}
                        className="pp-photo-img"
                        loading="lazy"
                      />
                    </div>
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
























