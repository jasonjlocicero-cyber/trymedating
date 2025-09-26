// src/components/AvatarUploader.jsx
import React, { useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AvatarUploader({ me, initialUrl, onChange }) {
  const [preview, setPreview] = useState(initialUrl || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const placeholder = useMemo(
    () => 'https://via.placeholder.com/96?text=%F0%9F%91%A4',
    []
  )

  async function handleFile(e) {
    setError('')
    setNotice('')

    const file = e.target.files?.[0]
    if (!file) return
    if (!me?.id) { setError('Please sign in.'); return }

    // basic client checks
    const validTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setError('Please upload a PNG, JPG, or WEBP image.')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setError('Max file size is 3MB.')
      return
    }

    setBusy(true)

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `${me.id}/${Date.now()}.${ext}`

    // upload to storage
    const { error: upErr } = await supabase
      .storage
      .from('avatars')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
      })

    if (upErr) {
      setError(upErr.message || 'Upload failed.')
      setBusy(false)
      return
    }

    // public URL
    const { data: urlData } = supabase
      .storage
      .from('avatars')
      .getPublicUrl(path)
    const publicUrl = urlData?.publicUrl

    // save to profile
    const { error: upProfileErr } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('user_id', me.id)

    if (upProfileErr) {
      setError(upProfileErr.message || 'Failed to save avatar to profile.')
      setBusy(false)
      return
    }

    setPreview(publicUrl)
    setNotice('Avatar updated!')
    setBusy(false)
    onChange?.(publicUrl)
  }

  async function removeAvatar() {
    if (!me?.id) return
    setBusy(true)
    setError('')
    setNotice('')

    // Optional: remove all files in the user's folder (skip to keep storage history)
    // For now, we’ll just clear the URL in the profile.
    const { error: upProfileErr } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('user_id', me.id)

    if (upProfileErr) {
      setError(upProfileErr.message || 'Could not remove avatar.')
    } else {
      setPreview('')
      onChange?.('')
      setNotice('Avatar removed.')
    }
    setBusy(false)
  }

  return (
    <div className="card" style={{ display:'grid', gap: 10 }}>
      <div style={{ fontWeight: 800 }}>Profile photo</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img
          src={preview || placeholder}
          alt="Avatar"
          style={{
            width: 96, height: 96, borderRadius: '50%',
            objectFit: 'cover', border: '1px solid var(--border)'
          }}
        />
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="btn" style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Uploading…' : 'Choose image'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFile}
              style={{ display: 'none' }}
              disabled={busy}
            />
          </label>
          {preview && (
            <button className="btn" onClick={removeAvatar} disabled={busy}>Remove</button>
          )}
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            PNG/JPG/WEBP up to 3MB.
          </div>
        </div>
      </div>

      {error && <div style={{ color:'#b91c1c' }}>{error}</div>}
      {notice && <div style={{ color:'var(--secondary)' }}>{notice}</div>}
    </div>
  )
}
