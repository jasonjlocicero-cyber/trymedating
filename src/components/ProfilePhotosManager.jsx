// src/components/ProfilePhotosManager.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import ImageCropModal from './ImageCropModal'

const BUCKET = 'profile-photos'
const MAX_PHOTOS = 6
const MIN_PHOTOS = 3

function makeId() {
  // browser-safe unique-ish id for filenames
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function ProfilePhotosManager({ userId }) {
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [photos, setPhotos] = useState([])

  const canUploadMore = useMemo(() => photos.length < MAX_PHOTOS, [photos.length])

  // crop modal state (all profile photos)
  const [cropOpen, setCropOpen] = useState(false)
  const [cropSrc, setCropSrc] = useState('')
  const [cropMime, setCropMime] = useState('image/jpeg')
  const pendingFileRef = useRef(null)

  useEffect(() => {
    if (!userId) return
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function signedUrl(path) {
    // Works for both authed + anon, subject to your storage.objects SELECT policy
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
    if (error) throw error
    return data?.signedUrl || ''
  }

  async function refresh() {
    setLoading(true)
    setErr('')
    setMsg('')
    try {
      const { data, error } = await supabase
        .from('profile_photos')
        .select('id, user_id, path, caption, sort_order, show_on_profile, show_on_public, created_at')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) throw error

      const rows = data || []
      const withUrls = await Promise.all(
        rows.map(async (p) => {
          const url = await signedUrl(p.path)
          return { ...p, url }
        })
      )

      setPhotos(withUrls)
    } catch (e) {
      setErr(e.message || 'Failed to load photos')
    } finally {
      setLoading(false)
    }
  }

  function openCropForFile(file) {
    const url = URL.createObjectURL(file)
    pendingFileRef.current = file
    setCropMime(file.type || 'image/jpeg')
    setCropSrc(url)
    setCropOpen(true)
  }

  function closeCrop() {
    setCropOpen(false)
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc('')
    setCropMime('image/jpeg')
    pendingFileRef.current = null
  }

  async function uploadPhotoFile(file) {
    if (!file || !userId) return

    setErr('')
    setMsg('')

    if (!canUploadMore) {
      setErr(`Max ${MAX_PHOTOS} photos.`)
      return
    }

    setUploading(true)
    try {
      const extFromName = file.name?.includes('.') ? file.name.split('.').pop()?.toLowerCase() : ''
      const ext =
        extFromName ||
        (file.type === 'image/png' ? 'png' : '') ||
        (file.type === 'image/webp' ? 'webp' : '') ||
        (file.type === 'image/heic' ? 'heic' : '') ||
        'jpg'

      const path = `${userId}/${makeId()}.${ext}`

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg',
      })
      if (upErr) throw upErr

      // create DB row
      const nextOrder = photos.length + 1
      const { data: created, error: insErr } = await supabase
        .from('profile_photos')
        .insert({
          user_id: userId,
          path,
          caption: '',
          sort_order: nextOrder,
          show_on_profile: true,
          show_on_public: false,
        })
        .select('id, user_id, path, caption, sort_order, show_on_profile, show_on_public, created_at')
        .single()

      if (insErr) throw insErr

      const url = await signedUrl(created.path)
      setPhotos((prev) => [...prev, { ...created, url }])
      setMsg('Photo added.')
    } catch (e2) {
      setErr(e2.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !userId) return

    setErr('')
    setMsg('')

    if (!canUploadMore) {
      setErr(`Max ${MAX_PHOTOS} photos.`)
      return
    }

    openCropForFile(file)
  }

  async function confirmCrop(blob) {
    const original = pendingFileRef.current
    if (!original) {
      closeCrop()
      return
    }

    const ext = blob.type.includes('png') ? 'png' : 'jpg'
    const cropped = new File([blob], `photo.${ext}`, { type: blob.type || 'image/jpeg' })

    closeCrop()
    await uploadPhotoFile(cropped)
  }

  async function updatePhoto(id, patch) {
    setErr('')
    setMsg('')
    try {
      const { data, error } = await supabase
        .from('profile_photos')
        .update(patch)
        .eq('id', id)
        .eq('user_id', userId)
        .select('id, user_id, path, caption, sort_order, show_on_profile, show_on_public, created_at')
        .single()

      if (error) throw error

      setPhotos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...data } : p))
      )
      setMsg('Saved.')
    } catch (e) {
      setErr(e.message || 'Update failed')
    }
  }

  async function persistOrder(next) {
    // Re-number sort_order 1..N and persist (only 6 max, so simple loop is fine)
    const normalized = next.map((p, idx) => ({ ...p, sort_order: idx + 1 }))
    setPhotos(normalized)

    try {
      for (const p of normalized) {
        const { error } = await supabase
          .from('profile_photos')
          .update({ sort_order: p.sort_order })
          .eq('id', p.id)
          .eq('user_id', userId)
        if (error) throw error
      }
    } catch (e) {
      setErr(e.message || 'Failed to save order')
    }
  }

  function move(id, dir) {
    const idx = photos.findIndex((p) => p.id === id)
    if (idx < 0) return
    const swapWith = dir === 'up' ? idx - 1 : idx + 1
    if (swapWith < 0 || swapWith >= photos.length) return

    const next = [...photos]
    const tmp = next[idx]
    next[idx] = next[swapWith]
    next[swapWith] = tmp

    persistOrder(next)
  }

  async function removePhoto(p) {
    if (!confirm('Remove this photo?')) return
    setErr('')
    setMsg('')
    try {
      // delete db row first
      const { error: delRowErr } = await supabase
        .from('profile_photos')
        .delete()
        .eq('id', p.id)
        .eq('user_id', userId)

      if (delRowErr) throw delRowErr

      // then delete storage object
      const { error: delObjErr } = await supabase.storage.from(BUCKET).remove([p.path])
      if (delObjErr) {
        // not fatal to UI if storage delete fails, but tell you
        console.warn('Storage delete failed:', delObjErr)
      }

      const next = photos.filter((x) => x.id !== p.id)
      await persistOrder(next)
      setMsg('Removed.')
    } catch (e) {
      setErr(e.message || 'Remove failed')
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontWeight: 900, marginBottom: 6 }}>Profile photos</h2>
      <div className="muted" style={{ marginBottom: 12 }}>
        Upload {MIN_PHOTOS}–{MAX_PHOTOS} photos. Choose what shows on your Profile vs Public page.
      </div>

      {err && <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <label className="btn btn-primary btn-pill" style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
          {uploading ? 'Uploading…' : `Add photo (${photos.length}/${MAX_PHOTOS})`}
          <input
            type="file"
            accept="image/*"
            onChange={handleUpload}
            style={{ display: 'none' }}
            disabled={uploading || !canUploadMore}
          />
        </label>

        <button type="button" className="btn btn-neutral btn-pill" onClick={refresh} disabled={loading || uploading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="muted">Loading photos…</div>
      ) : photos.length === 0 ? (
        <div className="muted">No photos yet.</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {photos.map((p) => (
            <div key={p.id} className="card" style={{ padding: 12, borderRadius: 14 }}>
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: '#f3f4f6',
                  marginBottom: 10,
                }}
              >
                {p.url ? (
                  <img
                    src={p.url}
                    alt="Profile"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div className="muted" style={{ padding: 12 }}>No preview</div>
                )}
              </div>

              <label className="form-label" style={{ display: 'grid', gap: 6 }}>
                Caption (optional)
                <input
                  className="input"
                  value={p.caption || ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, caption: v } : x)))
                  }}
                  onBlur={() => updatePhoto(p.id, { caption: p.caption || '' })}
                  placeholder="Say something about this photo…"
                />
              </label>

              <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!p.show_on_profile}
                    onChange={(e) => updatePhoto(p.id, { show_on_profile: e.target.checked })}
                  />
                  Show on Profile page
                </label>

                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!p.show_on_public}
                    onChange={(e) => updatePhoto(p.id, { show_on_public: e.target.checked })}
                  />
                  Show on Public page
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button type="button" className="btn btn-neutral btn-pill" onClick={() => move(p.id, 'up')}>
                  ↑
                </button>
                <button type="button" className="btn btn-neutral btn-pill" onClick={() => move(p.id, 'down')}>
                  ↓
                </button>
                <button type="button" className="btn btn-danger btn-pill" onClick={() => removePhoto(p)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ImageCropModal
        open={cropOpen}
        src={cropSrc}
        aspect={1}
        title="Crop photo"
        mimeHint={cropMime}
        onCancel={closeCrop}
        onConfirm={confirmCrop}
      />
    </div>
  )
}


