// src/components/EventsDebugPanel.jsx
import React, { useMemo, useState } from 'react'

/**
 * Dev-only debug widget.
 * IMPORTANT: This must never be able to crash production UI.
 */
export default function EventsDebugPanel({
  title = 'Debug',
  events = [],
  enabled
}) {
  // Default: only show in dev
  const show = typeof enabled === 'boolean' ? enabled : import.meta.env.DEV

  const [open, setOpen] = useState(false)

  const safeEvents = Array.isArray(events) ? events : []
  const text = useMemo(() => {
    try {
      return JSON.stringify(safeEvents.slice(-200), null, 2)
    } catch {
      return '[]'
    }
  }, [safeEvents])

  // Never render this in prod unless explicitly enabled
  if (!show) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore
    }
  }

  return (
    <div style={wrapStyle}>
      {!open ? (
        <button type="button" style={fabStyle} onClick={() => setOpen(true)}>
          {title}
        </button>
      ) : (
        <div style={panelStyle}>
          <div style={headerStyle}>
            <strong>{title}</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btnStyle} onClick={copy}>
                Copy
              </button>
              <button type="button" style={btnStyle} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>

          <pre style={preStyle}>{text}</pre>
        </div>
      )}
    </div>
  )
}

const wrapStyle = {
  position: 'fixed',
  left: 12,
  bottom: 12,
  zIndex: 9999,
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
}

const fabStyle = {
  border: '1px solid rgba(0,0,0,0.12)',
  background: '#fff',
  borderRadius: 999,
  padding: '10px 14px',
  boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
  cursor: 'pointer',
  fontWeight: 700
}

const panelStyle = {
  width: 420,
  maxWidth: 'calc(100vw - 24px)',
  border: '1px solid rgba(0,0,0,0.12)',
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 12px 30px rgba(0,0,0,0.16)',
  overflow: 'hidden'
}

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 10,
  borderBottom: '1px solid rgba(0,0,0,0.08)',
  background: '#f8fafc'
}

const btnStyle = {
  border: '1px solid rgba(0,0,0,0.12)',
  background: '#fff',
  borderRadius: 10,
  padding: '6px 10px',
  cursor: 'pointer',
  fontWeight: 600
}

const preStyle = {
  margin: 0,
  padding: 10,
  maxHeight: 240,
  overflow: 'auto',
  fontSize: 12,
  lineHeight: 1.45,
  background: '#0b1220',
  color: '#e5e7eb'
}



