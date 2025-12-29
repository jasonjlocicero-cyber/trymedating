import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function PublicProfilePhotos({ userId }) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [photos, setPhotos] = useState([])

  useEffect(() => {
    let alive = true

    async function load() {
      if (!userId) {
        setPhotos([])
        setLoading(false)
        return
      }

      setLoading(true)
      setErr('')

      // 1) Pull photos that are marked for public display
      const { data, error } = await supabase
        .from('profile_photos')
        .select('id, path, caption, sort_order')
        .eq('user_id', userId)
        .eq('show_on_public', true)
        .order('sort_order', { ascending: true })

      if (!alive) return
      if (error) {
        setErr(error.message || 'Failed to load photos')
        setPhotos([])
        setLoading(false)
        return
      }

      // 2) Convert paths -> signed URLs (works for private buckets)
      const withUrls = await Promise.all(
        (data || []).map(async (p) => {
          const { data: s, error: sErr } = await supabase.storage
            .from('profile-photos')
            .createSignedUrl(p.path, 60 * 60)

          return { ...p, url: sErr ? null : s?.signedUrl || null }
        })
      )

      setPhotos(withUrls.filter((p) => !!p.url))
      setLoading(false)
    }

    load()
    return () => { alive = false }
  }, [userId])

  if (loading) return <div className="muted" style={{ marginTop: 14 }}>Loading photos…</div>
  if (err) return <div className="helper-error" style={{ marginTop: 14 }}>{err}</div>
  if (!photos.length) return null

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontWeight: 900, marginBottom: 8 }}>Photos</h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        {photos.map((p) => (
          <figure key={p.id} style={{ margin: 0 }}>
            <img
              src={p.url}
              alt={p.caption || 'Profile photo'}
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                objectFit: 'cover',
                borderRadius: 12,
              }}
            />
            {p.caption ? (
              <figcaption className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                {p.caption}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>
    </div>
  )
}

