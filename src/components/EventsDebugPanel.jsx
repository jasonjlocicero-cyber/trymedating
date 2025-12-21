// src/components/EventsDebugPanel.jsx
import React, { useMemo, useState } from 'react'

export default function EventsDebugPanel({ title = 'Debug', events }) {
  // DEV-only. Never let debug tooling break production.
  if (!import.meta.env.DEV) return null

  const [open, setOpen] = useState(false)

  const safeEvents = useMemo(() => {
    if (!events) return []
    return Array.isArray(events) ? events : [events]
  }, [events])

  return (
    <div style={styles.root}>
      <button
        type="button"
        style={styles.toggle}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide' : 'Show'} {title}
      </button>

      {open && (
        <div style={styles.panel}>
          <pre style={styles.pre}>{JSON.stringify(safeEvents, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

const styles = {
  root: {
    position: 'fixed',
    right: 12,
    bottom: 80,
    zIndex: 9999,
    fontFamily:
      'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
  },
  toggle: {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(0,0,0,0.15)',
    background: '#fff',
    cursor: 'pointer'
  },
  panel: {
    marginTop: 8,
    width: 360,
    maxHeight: 280,
    overflow: 'auto',
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.15)',
    background: '#fff',
    boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
  },
  pre: {
    margin: 0,
    padding: 12,
    fontSize: 12,
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  }
}






