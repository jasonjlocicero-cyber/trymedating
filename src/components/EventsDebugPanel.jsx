// src/components/EventsDebugPanel.jsx
import React, { useEffect, useState } from 'react'

export default function EventsDebugPanel() {
  // Enable logic: ?debug=1 OR localStorage('eventsDebug') === '1' OR hotkey toggles it on
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return false
    const url = new URL(window.location.href)
    const q = url.searchParams.get('debug')
    if (q === '1') return true
    return window.localStorage.getItem('eventsDebug') === '1'
  })

  // Open/close the panel UI
  const [open, setOpen] = useState(false)

  // Event list (mirrors window.__eventsDebug as appended by analytics.js)
  const [items, setItems] = useState(() =>
    typeof window !== 'undefined' ? (window.__eventsDebug || []) : []
  )

  // Subscribe to append events
  useEffect(() => {
    function onAppend() {
      setItems([...(window.__eventsDebug || [])])
    }
    window.addEventListener('__eventsDebugAppend', onAppend)
    return () => window.removeEventListener('__eventsDebugAppend', onAppend)
  }, [])

  // Hotkey: Ctrl+Shift+E (Win/Linux) or Cmd+Shift+E (Mac)
  useEffect(() => {
    function onKey(e) {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const metaOk = isMac ? e.metaKey : e.ctrlKey
      if (metaOk && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        // toggle enabled ON if currently disabled
        if (!enabled) {
          window.localStorage.setItem('eventsDebug', '1')
          setEnabled(true)
          setOpen(true)
        } else {
          // if enabled, just toggle open/close
          setOpen((v) => !v)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])

  // React to other tabs changing localStorage (optional nicety)
  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'eventsDebug') {
        setEnabled(e.newValue === '1')
        if (e.newValue !== '1') setOpen(false)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (!enabled) return null

  return (
    <div style={wrap}>
      {!open ? (
        <button style={fab} onClick={() => setOpen(true)} title="Open Events Debug (Ctrl/Cmd+Shift+E)">
          ⚡ Events
        </button>
      ) : (
        <div style={panel}>
          <div style={header}>
            <div style={{ fontWeight: 800 }}>Events Debug</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={btn}
                onClick={() => {
                  window.__eventsDebug = []
                  setItems([])
                }}
              >
                Clear
              </button>
              <button
                style={btn}
                onClick={() => {
                  // Disable entirely
                  window.localStorage.removeItem('eventsDebug')
                  setEnabled(false)
                  setOpen(false)
                }}
                title="Disable debug"
              >
                Disable
              </button>
              <button style={btn} onClick={() => setOpen(false)} title="Close">
                ×
              </button>
            </div>
          </div>
          <div style={body}>
            {items.length === 0 && (
              <div style={{ color: '#666' }}>No events yet… trigger some actions.</div>
            )}
            {items
              .slice()
              .reverse()
              .map((e, idx) => (
                <div key={idx} style={row}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700 }}>
                        {e.type === 'pageview' ? 'Pageview' : e.name}
                      </span>
                      {e.type !== 'pageview' && <span style={badge}>event</span>}
                    </div>
                    <div style={{ color: '#666', fontSize: 12 }}>{formatTime(e.t)}</div>
                  </div>
                  {e.props && Object.keys(e.props).length > 0 && (
                    <pre style={pre}>{JSON.stringify(e.props, null, 2)}</pre>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* Styles */
const wrap = { position: 'fixed', left: 12, bottom: 12, zIndex: 2000 }
const fab = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #ddd',
  background: '#fff',
  boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
  cursor: 'pointer',
}
const panel = {
  width: 'min(420px, 92vw)',
  height: 'min(60vh, 520px)',
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 12,
  overflow: 'hidden',
  boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
}
const header = {
  padding: '8px 10px',
  borderBottom: '1px solid #eee',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}
const body = {
  padding: 10,
  height: 'calc(100% - 44px)',
  overflow: 'auto',
  background: 'linear-gradient(180deg, #fafafa, #fff)',
}
const row = {
  background: '#fff',
  border: '1px solid #eee',
  borderRadius: 8,
  padding: 10,
  marginBottom: 8,
}
const badge = {
  marginLeft: 8,
  fontSize: 10,
  padding: '2px 6px',
  background: '#008080',
  color: '#fff',
  borderRadius: 999,
}
const btn = {
  padding: '6px 8px',
  border: '1px solid #ddd',
  background: '#fff',
  borderRadius: 6,
  cursor: 'pointer',
}
const pre = {
  margin: '6px 0 0',
  padding: 8,
  background: '#fafafa',
  border: '1px solid #eee',
  borderRadius: 6,
  fontSize: 12,
  overflowX: 'auto',
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString()
  } catch {
    return ''
  }
}

