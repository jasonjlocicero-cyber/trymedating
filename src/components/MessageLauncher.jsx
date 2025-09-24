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
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  function openChat() {
    const h = handle.trim()
    if (!h) return
    if (!window.trymeChat) {
      alert('Messaging not ready on this page. Try a hard refresh.')
      return
    }
    if (!me) {
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
          marginBottom: 10,
          width: 320,
          padding: 14,
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 14,
          boxShadow: '0 8px 24px rgba(0,0,0,.12)'
        }}>
          <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 15 }}>Start a message</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder="Enter a handle (e.g. alex)"
              style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            />
            <button onClick={openChat} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
              Open
            </button>
          </div>
          {!me && <div style={{ marginTop: 8, fontSize: 12, opacity: .7 }}>Sign in required to send.</div>}
        </div>
      )}

      {/* Floating Button + Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
        {/* Desktop label (hidden on small screens via CSS) */}
        <div className="ml-label" style={{
          pointerEvents: 'auto',
          padding: '10px 14px',
          borderRadius: 999,
          background: 'rgba(255,255,255,.9)',
          border: '1px solid #e5e7eb',
          boxShadow: '0 6px 18px rgba(0,0,0,.08)',
          fontWeight: 700
        }}>
          Messages
        </div>

        {/* Big gradient FAB with subtle pulse */}
        <button
          onClick={() => setOpen(v => !v)}
          title="Messages"
          className="ml-pulse"
          style={{
            pointerEvents: 'auto',
            width: 72, height: 72, borderRadius: '50%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '0',
            color: '#fff',
            fontSize: 28,
            fontWeight: 800,
            boxShadow: '0 18px 40px rgba(42,157,143,.35)',
            background: 'linear-gradient(135deg, #2A9D8F 0%, #4F46E5 100%)',
            transition: 'transform .06s ease'
          }}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          💬
        </button>
      </div>
    </div>
  )
}

