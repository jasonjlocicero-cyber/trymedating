import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const BUCKET = 'profile-photos'
const MAX_PHOTOS = 6
const SIGNED_URL_TTL = 60 * 60 // 1 hour

function sanitizeFilename(name = 'photo') {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function getSignedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error) throw error
  return data?.signedUrl || null
}

export default function ProfilePhotosManager() {
  const [me, setMe] = useState(null)
  const [photos, setPhotos] = useState([]) // rows + signedUrl
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  const count = photos.length
  const maxSort = useMemo(() => {
    if (!photos.length) return 0
    return Math.max(...photos.map((p) => p.sort_order ?? 0), 0)
  }, [photos])

  // auth
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setMe(user || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null)
    })
    return () => {
      alive = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  async function load() {
    setErr('')
    setLoading(true)
    try {
      if (!me?.id) {
        setPhotos([])
        return
      }

      const { data, error } = await supabase
        .from('profile_photos')
        .select('id, user_id, path, caption, show_on_profile, show_on_public, sort_order, created_at')
        .eq('user_id', me.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) throw error

      const rows = data || []
      const urls = await Promise.all(
        rows.map(async (r) => {
          try {
            const signedUrl = await getSignedUrl(r.path)
            return { ...r, signedUrl }
          } catch {
            return { ...r, signedUrl: null }
          }
        })
      )

      setPhotos(urls)
    } catch (e) {
      setErr(e.message || 'Failed to load profile photos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  async function handleUploadFiles(fileList) {
    if (!me?.id) {
      setErr('Sign in to upload photos.')
      return
    }

    const files = Array.from(fileList || []).filter(Boolean)
    if (!files.length) return

    const remaining = Math.max(0, MAX_PHOTOS - count)
    const selected = files.slice(0, remaining)

    if (files.length > remaining) {
      setErr(`You can upload up to ${MAX_PHOTOS} photos total. Only the first ${remaining} were selected.`)
    } else {
      setErr('')
    }

    setBusy(true)
    try {
      let nextSort = maxSort

      for (const file of selected) {
        nextSort += 1
        const safe = sanitizeFilename(file.name)
        const key = `${me.id}/${crypto.randomUUID()}-${safe}`

        // 1) upload to storage
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, file, {
          upsert: false,
          contentType: file.type || 'image/jpeg',
        })
        if (upErr) throw upErr

        // 2) insert row in DB
        const { error: insErr } = await supabase
          .from('profile_photos')
          .insert({
            user_id: me.id,
            path: key,
            caption: '',
            show_on_profile: true,
            show_on_public: false,
            sort_order: nextSort,
          })

        if (insErr) {
          // best-effort cleanup
          await supabase.storage.from(BUCKET).remove([key])
          throw insErr
        }
      }

      if (fileRef.current) fileRef.current.value = ''
      await load()
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
      await load()
    } catch (e) {
      setErr(e.message || 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto(p) {
    if (!confirm('Delete this photo?')) return
    setBusy(true)
    setErr('')
    try {
      // remove from storage first
      const { error: delObjErr } = await supabase.storage.from(BUCKET).remove([p.path])
      if (delObjErr) throw delObjErr

      // then delete DB row
      const { error: delRowErr } = await supabase.from('profile_photos').delete().eq('id', p.id)
      if (delRowErr) throw delRowErr

      await load()
    } catch (e) {
      setErr(e.message || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function move(p, dir) {
    const idx = photos.findIndex((x) => x.id === p.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (idx < 0 || swapIdx < 0 || swapIdx >= photos.length) return

    const a = photos[idx]
    const b = photos[swapIdx]

    setBusy(true)
    setErr('')
    try {
      // swap sort_order
      const { error: e1 } = await supabase.from('profile_photos').update({ sort_order: b.sort_order }).eq('id', a.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('profile_photos').update({ sort_order: a.sort_order }).eq('id', b.id)
      if (e2) throw e2

      await load()
    } catch (e) {
      setErr(e.message || 'Reorder failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Profile photos</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Upload 3–6 photos. Choose what shows on your profile and what’s public.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="muted" style={{ fontSize: 12 }}>{count}/{MAX_PHOTOS}</div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!me?.id || busy || count >= MAX_PHOTOS}
            onClick={() => fileRef.current?.click()}
          >
            Add photos
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleUploadFiles(e.target.files)}
          />
        </div>
      </div>

      {err && <div className="helper-error" style={{ marginTop: 10 }}>{err}</div>}
      {!me?.id && <div className="helper-error" style={{ marginTop: 10 }}>Sign in to manage profile photos.</div>}

      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading photos…</div>}

      {!loading && me?.id && (
        <>
          {photos.length === 0 && (
            <div className="muted" style={{ marginTop: 12 }}>
              No photos yet. Add at least 3 so your profile looks legit.
            </div>
          )}

          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {photos.map((p, i) => (
              <div
                key={p.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: '#fff',
                  boxShadow: '0 8px 18px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ position: 'relative', aspectRatio: '1 / 1', background: '#f3f4f6' }}>
                  {p.signedUrl ? (
                    <img
                      src={p.signedUrl}
                      alt="Profile"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ padding: 12 }} className="muted">Preview unavailable</div>
                  )}

                  <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6 }}>
                    <button className="btn btn-neutral" style={{ padding: '4px 8px' }} disabled={busy || i === 0} onClick={() => move(p, 'up')}>
                      ↑
                    </button>
                    <button className="btn btn-neutral" style={{ padding: '4px 8px' }} disabled={busy || i === photos.length - 1} onClick={() => move(p, 'down')}>
                      ↓
                    </button>
                  </div>
                </div>

                <div style={{ padding: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!p.show_on_profile}
                      disabled={busy}
                      onChange={(e) => updatePhoto(p.id, { show_on_profile: e.target.checked })}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Show on Profile</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <input
                      type="checkbox"
                      checked={!!p.show_on_public}
                      disabled={busy}
                      onChange={(e) => updatePhoto(p.id, { show_on_public: e.target.checked })}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Public</span>
                  </label>

                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Caption (optional)</div>
                  <textarea
                    value={p.caption || ''}
                    disabled={busy}
                    placeholder="Add a short note about this photo…"
                    style={{
                      width: '100%',
                      minHeight: 54,
                      resize: 'vertical',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      padding: 8,
                      fontSize: 12,
                    }}
                    onChange={(e) => {
                      const val = e.target.value
                      setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, caption: val } : x)))
                    }}
                    onBlur={(e) => updatePhoto(p.id, { caption: e.target.value })}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-neutral" disabled={busy} onClick={() => removePhoto(p)}>
                      Delete
                    </button>
                    <div className="muted" style={{ fontSize: 12 }}>#{p.sort_order ?? i + 1}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

  );
}
