// src/components/MessageLauncher.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function MessageLauncher() {
  const [open, setOpen] = useState(false)
  const [handle, setHandle] = useState('')
  const [me, setMe] = useState(null)

  // Load auth state (so we can redirect if needed)
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
      alert('Messaging not ready on this page yet. Try a hard refresh.')
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
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }}>
      {/* White "Messages" pill (always visible) */}
      <div style={{
        background: '#fff',
        borderRadius: 999,
        padding: '8px 14px',
        fontWeight: 700,
        fontSize: 14,
        boxShadow: '0 6px 18px rgba(0,0,0,.08)'
      }}>
        Messages
      </div>

      {/* Brand gradient FAB */}
      <div style={{ position: 'relative' }}>
        {/* Toggle tray button */}
        <button
          onClick={() => setOpen(v => !v)}
          title="Messages"
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--secondary), var(--primary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 18px 40px rgba(42,157,143,.35)',
            color: '#fff',
            fontSize: 26,
            fontWeight: 800,
            transition: 'transform .06s ease'
          }}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          💬
        </button>

        {/* Tray with handle input */}
        {open && (
          <div style={{
            position: 'absolute',
            right: 72 + 8, // sit to the left of the button
            bottom: 0,
            width: 320,
            padding: 14,
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 14,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          }}>
            <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 15 }}>Start a message</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={handle}
                onChange={e => setHandle(e.target.value)}
                placeholder="Enter a handle (e.g. alex)"
                style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              />
              <button
                onClick={openChat}
                className="btn btn-primary"
                style={{ whiteSpace: 'nowrap' }}
              >
                Open
              </button>
            </div>
            {!me && <div style={{ marginTop: 8, fontSize: 12, opacity: .7 }}>Sign in required to send.</div>}
          </div>
        )}
      </div>
    </div>
  )
}


