// src/components/EventsDebugPanel.jsx
import React, { useEffect, useMemo, useState } from 'react'

export default function EventsDebugPanel() {
  // Only show if ?debug=1 or localStorage flag
  const enabled = useMemo(() => {
    if (typeof window === 'undefined') return false
    const url = new URL(window.location.href)
    const q = url.searchParams.get('debug')
    if (q === '1') return true
    return window.localStorage.getItem('eventsDebug') === '1'
  }, [])

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(() => (typeof window !== 'undefined' ? (window.__eventsDebug || []) : []))

  useEffect(() => {
    function onAppend() {
      setItems([...(window.__eventsDebug || [])])
    }
    window.addEventListener('__eventsDebugAppend', onAppend)
    return () => window.removeEventListener('__eventsDebugAppend', onAppend)
  }, [])

  if (!enabled) return null

  return (
    <div style={wrap}>
      {!open ? (
        <button style={fab} onClick={() => setOpen(true)} title="Open Events Debug">⚡ Events</button>
      ) : (
        <div style={panel}>
          <div style={header}>
            <div style={{ fontWeight: 800 }}>Events Debug</div>
            <div style={{ display:'flex', gap:8 }}>
              <button style={btn} onClick={() => { window.__eventsDebug = []; setItems([]) }}>Clear</button>
              <button style={btn} onClick={() => setOpen(false)} title="Close">×</button>
            </div>
          </div>
          <div style={body}>
            {items.length === 0 && <div style={{ color:'#666' }}>No events yet… trigger some actions.</div>}
            {items.slice().reverse().map((e, idx) => (
              <div key={idx} style={row}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                  <div>
                    <span style={{ fontWeight:700 }}>{e.type === 'pageview' ? 'Pageview' : e.name}</span>
                    {e.type !== 'pageview' && <span style={badge}>event</span>}
                  </div>
                  <div style={{ color:'#666', fontSize:12 }}>{formatTime(e.t)}</div>
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
const wrap = { position:'fixed', left:12, bottom:12, zIndex: 2000 }
const fab = {
  padding:'8px 12px', borderRadius:8, border:'1px solid #ddd', background:'#fff',
  boxShadow:'0 6px 20px rgba(0,0,0,0.12)', cursor:'pointer'
}
const panel = {
  width: 'min(420px, 92vw)', height: 'min(60vh, 520px)',
  background:'#fff', border:'1px solid #ddd', borderRadius:12, overflow:'hidden',
  boxShadow:'0 16px 40px rgba(0,0,0,0.18)'
}
const header = { padding:'8px 10px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }
const body = { padding:10, height:'calc(100% - 44px)', overflow:'auto', background:'linear-gradient(180deg, #fafafa, #fff)' }
const row = { background:'#fff', border:'1px solid #eee', borderRadius:8, padding:10, marginBottom:8 }
const badge = { marginLeft:8, fontSize:10, padding:'2px 6px', background:'#008080', color:'#fff', borderRadius:999 }
const btn = { padding:'6px 8px', border:'1px solid #ddd', background:'#fff', borderRadius:6, cursor:'pointer' }
const pre = { margin: '6px 0 0', padding:8, background:'#fafafa', border:'1px solid #eee', borderRadius:6, fontSize:12, overflowX:'auto' }

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString() } catch { return '' }
}
