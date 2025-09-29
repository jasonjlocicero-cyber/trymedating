// src/components/AvatarUploader.jsx
import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Props:
 * - userId (required)
 * - value: current avatar_url (string|null)
 * - onChange: (newUrl:string|null) => void
 */
export default function AvatarUploader({ userId, value, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    setError('')
  }, [value])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (!/^image\//.test(file.type)) {
      setError('Please select an image file.')
      return
    }
    // basic size guard ~5MB
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.')
      return
    }

    setUploading(true)
    try {
      // Ensure a unique, user-namespaced path
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const objectName = `${userId}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('avatars').upload(objectName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      })
      if (upErr) throw upErr

      // public URL (bucket should be public or use signed URL if private)
      const { data } = supabase.storage.from('avatars').getPublicUrl(objectName)
      const publicUrl = data?.publicUrl || null
      if (!publicUrl) throw new Error('Could not resolve public URL')
      onChange?.(publicUrl)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function triggerPick() {
    inputRef.current?.click()
  }

  function clearAvatar() {
    onChange?.(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div style={{ display:'grid', gap:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{
          width:88, height:88, borderRadius:16,
          background: value ? `url(${value}) center/cover no-repeat` : '#f1f5f9',
          border:'1px solid var(--border)', flex:'0 0 88px'
        }} />
        <div style={{ display:'grid', gap:8 }}>
          <div className="muted" style={{ fontSize:12 }}>
            Recommended: square image, at least 320×320.
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button type="button" className="btn" onClick={triggerPick} disabled={uploading}>
              {uploading ? 'Uploading…' : (value ? 'Change photo' : 'Upload photo')}
            </button>
            {value && (
              <button type="button" className="btn" onClick={clearAvatar} disabled={uploading}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display:'none' }}
      />

      {error && <div style={{ color:'#b91c1c', fontSize:13 }}>{error}</div>}
    </div>
  )
}
