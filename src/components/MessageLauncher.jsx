// src/components/MessageLauncher.jsx
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function MessageLauncher() {
  const [open, setOpen] = useState(false)
  const [handle, setHandle] = useState('')
  const [me, setMe] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setMe(user || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setMe(session?.user || null)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  function openChat() {
    const h = handle.trim()
    if (!h) return
    if (!window.trymeChat) {
      alert('Messaging not ready on this page. Try a hard refresh.')
      return
    }
    if (!me) {
      // send to auth, then back to the same URL (no custom next param here)
      window.location.href = '/auth'
      return
    }
    window.trymeChat.open({ handle: h })
    setOpen(false)
    setHandle('')
  }

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 10000, pointerEvents: 'none' }}>
      {/* Tray */}
      {open && (
        <div style={{
          pointerEvents: 'auto',
          marginBottom: 8,
          width: 280,
          padding: 12,
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,.08)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Start a message</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder="Enter a handle (e.g. alex)"
              style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <button
              onClick={openChat}
              className="btn btn-primary"
              style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}
            >
              Open
            </button>
          </div>
          {!me && <div style={{ marginTop: 8, fontSize: 12, opacity: .7 }}>Sign in required to send.</div>}
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="btn btn-secondary"
        style={{
          pointerEvents: 'auto',
          width: 56, height: 56, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800
        }}
        title="Messages"
      >
        💬
      </button>
    </div>
  )
}
