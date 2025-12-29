// src/components/ProfilePhotosManager.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const BUCKET = 'profile-photos'
const MAX_PHOTOS = 6

function getExt(filename) {
  const parts = String(filename || '').split('.')
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : 'jpg'
  return ext || 'jpg'
}

function makePath(userId, file) {
  const ext = getExt(file?.name)
  const id =
    (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
    `${Date.now()}_${Math.random().toString(16).slice(2)}`
  return `${userId}/${id}.${ext}`
}

async function signedUrlFor(path) {
  // 1 hour signed url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data?.signedUrl || ''
}

export default function ProfilePhotosManager({ userId, maxPhotos = MAX_PHOTOS }) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [photos, setPhotos] = useState([]) // rows from profile_photos
  const [urls, setUrls] = useState({}) // path -> signedUrl

  const remaining = useMemo(() => Math.max(0, maxPhotos - photos.length), [maxPhotos, photos.length])

  async function refresh() {
    if (!userId) return
    setLoading(true)
    setErr('')
    try {
      const { data, error } = await supabase
        .from('profile_photos')
        .select('id, user_id, path, caption, sort_order, show_on_profile, show_on_public, created_at')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) throw error
      setPhotos(data || [])
    } catch (e) {
      setErr(e.message || 'Failed to load photos')
      setPhotos([])
    } finally {
      setLoading(false)
    }
  }

  // Load rows
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Keep signed URLs in sync (only for current photos)
  useEffect(() => {
    let cancelled = false

    async function hydrateUrls() {
      try {
        const next = {}
        for (const p of photos) {
          try {
            next[p.path] = await signedUrlFor(p.path)
          } catch {
            // ignore a broken file so the rest still render
            next[p.path] = ''
          }
        }
        if (!cancelled) setUrls(next)
      } catch {
        // noop
      }
    }

    hydrateUrls()
    return () => {
      cancelled = true
    }
  }, [photos])

  async function uploadFiles(ev) {
    const files = Array.from(ev.target.files || [])
    ev.target.value = ''
    if (!userId || files.length === 0) return

    if (remaining <= 0) {
      setErr(`You already have ${maxPhotos} photos. Remove one to upload more.`)
      return
    }

    const toUpload = files.slice(0, remaining)
    setBusy(true)
    setErr('')

    try {
      // Upload + insert rows
      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i]
        const path = makePath(userId, file)

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || 'image/jpeg'
        })
        if (upErr) throw upErr

        const sortOrder = (photos?.[photos.length - 1]?.sort_order ?? (photos.length - 1)) + 1

        const { error: insErr } = await supabase.from('profile_photos').insert({
          user_id: userId,
          path,
          caption: '',
          sort_order: sortOrder,
          show_on_profile: true,
          show_on_public: false
        })
        if (insErr) throw insErr
      }

      await refresh()
    } catch (e) {
      setErr(e.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function updatePhoto(id, patch) {
    setBusy(true)
    setErr('')
    try {
      const { error } = await supabase.from('profile_photos').update(patch).eq('id', id)
      if (error) throw error
      await refresh()
    } catch (e) {
      setErr(e.message || 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto(photo) {
    if (!photo?.id) return
    setBusy(true)
    setErr('')
    try {
      // 1) delete row
      const { error: delRowErr } = await supabase.from('profile_photos').delete().eq('id', photo.id)
      if (delRowErr) throw delRowErr

      // 2) delete file (best-effort)
      await supabase.storage.from(BUCKET).remove([photo.path])

      await refresh()
    } catch (e) {
      setErr(e.message || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <h2 style={{ fontWeight: 900, margin: 0 }}>Profile photos</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            Upload up to {maxPhotos} photos. Toggle where each photo shows and add an optional caption.
          </div>
        </div>

        <label className="btn btn-primary btn-pill" style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Working…' : `Upload (${remaining} left)`}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={uploadFiles}
            disabled={busy || remaining <= 0}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {err && <div className="helper-error" style={{ marginTop: 12 }}>{err}</div>}

      {loading ? (
        <div className="muted" style={{ marginTop: 14 }}>Loading photos…</div>
      ) : photos.length === 0 ? (
        <div className="muted" style={{ marginTop: 14 }}>No photos yet. Upload a few to get started.</div>
      ) : (
        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14
          }}
        >
          {photos.map((p) => {
            const url = urls[p.path] || ''
            return (
              <div
                key={p.id}
                style={{
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 14,
                  padding: 12,
                  background: '#fff'
                }}
              >
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: 'rgba(0,0,0,0.04)',
                    display: 'grid',
                    placeItems: 'center'
                  }}
                >
                  {url ? (
                    <img
                      src={url}
                      alt="Profile"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                  ) : (
                    <div className="muted" style={{ padding: 12, textAlign: 'center' }}>
                      Image not available
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Caption (optional)
                    <input
                      className="input"
                      value={p.caption || ''}
                      onChange={(e) => updatePhoto(p.id, { caption: e.target.value })}
                      placeholder="Say something about this photo…"
                      disabled={busy}
                    />
                  </label>

                  <div style={{ display: 'grid', gap: 6 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={!!p.show_on_profile}
                        onChange={(e) => updatePhoto(p.id, { show_on_profile: e.target.checked })}
                        disabled={busy}
                      />
                      Show on profile
                    </label>

                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={!!p.show_on_public}
                        onChange={(e) => updatePhoto(p.id, { show_on_public: e.target.checked })}
                        disabled={busy}
                      />
                      Show on public profile
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                    <button
                      type="button"
                      className="btn btn-neutral btn-pill"
                      onClick={() => removePhoto(p)}
                      disabled={busy}
                    >
                      Delete
                    </button>
                    <div className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                      {p.show_on_public ? 'Public' : 'Private'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


  );
}
