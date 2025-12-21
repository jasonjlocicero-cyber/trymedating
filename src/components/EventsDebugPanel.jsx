// src/components/EventsDebugPanel.jsx
import React, { useEffect, useMemo, useState } from 'react'

/**
 * Debug-only floating panel to inspect app events.
 * This MUST NEVER crash production.
 */
export default function EventsDebugPanel() {
  // Only show in DEV, and only if explicitly enabled (?debug=1)
  const enabled = useMemo(() => {
    if (!import.meta.env.DEV) return false
    try {
      const sp = new URLSearchParams(window.location.search)
      return sp.get('debug') === '1'
    } catch {
      return false
    }
  }, [])

  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState([])

  useEffect(() => {
    if (!enabled) return

    const push = (label, detail) => {
      setEvents((prev) => {
        const next = [{ t: new Date().toISOString(), label, detail }, ...prev]
        return next.slice(0, 50)
      })
    }

    const onOpenChat = (ev) => push('open-chat', ev?.detail ?? null)
    const onPop = () => push('popstate', { path: window.location.pathname + window.location.search + window.location.hash })

    window.addEventListener('open-chat', onOpenChat)
    window.addEventListener('popstate', onPop)

    push('mounted', { path: window.location.pathname + window.location.search + window.location.hash })

    return () => {
      window.removeEventListener('open-chat', onOpenChat)
      window.removeEventListener('popstate', onPop)
    }
  }, [enabled])

  if (!enabled) return null

  const panelStyle = {
    position: 'fixed',
    right: 16,
    bottom: 88,
    width: 360,
    maxWidth: 'calc(100vw - 24px)',
    background: '#111827',
    color: '#fff',
    borderRadius: 12,
    boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
    zIndex: 2000,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.12)',
  }

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 10px',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
    fontWeight: 800,
  }

  const bodyStyle = {
    maxHeight: 260,
    overflowY: 'auto',
    padding: 10,
    fontSize: 12,
    lineHeight: 1.4,
  }

  const pillBtn = {
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  }

  return (
    <>
      {/* Small toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Debug panel"
        aria-label="Debug panel"
        style={{
          position: 'fixed',
          right: 84,
          bottom: 16,
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: '#fff',
          boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 1999,
          cursor: 'pointer',
        }}
      >
        🐞
      </button>

      {open && (
        <div style={panelStyle} role="region" aria-label="Debug panel">
          <div style={headerStyle}>
            <div>Debug</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={pillBtn} onClick={() => setEvents([])}>
                Clear
              </button>
              <button type="button" style={pillBtn} onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
          </div>

          <div style={bodyStyle}>
            {events.length === 0 ? (
              <div style={{ opacity: 0.85 }}>No events yet.</div>
            ) : (
              events.map((e, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 8px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>
                    {e.label} <span style={{ opacity: 0.75, fontWeight: 600 }}>{e.t}</span>
                  </div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.9 }}>
                    {JSON.stringify(e.detail, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}


