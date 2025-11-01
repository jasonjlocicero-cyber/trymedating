// src/components/ChatMessageList.jsx
import React, { useEffect, useMemo, useRef } from 'react'

/**
 * Purely presentational list with:
 *  - day separators: "Today", "Yesterday", or date
 *  - auto-scroll to bottom when new messages arrive (unless user scrolled way up)
 *  - simple message bubble layout
 */
export default function ChatMessageList({ meId, messages = [] }) {
  const scrollerRef = useRef(null)
  const atBottomRef = useRef(true)

  // Track whether user is near bottom
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      atBottomRef.current = near
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll when new data comes in (only if near bottom or it’s the first load)
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight + 1000
    }
  }, [messages])

  // Group with day separators
  const itemsWithSeparators = useMemo(() => {
    const out = []
    let lastDay = ''
    for (const m of messages) {
      const dayKey = dayLabel(m.created_at)
      if (dayKey !== lastDay) {
        out.push({ _sep: true, id: `sep-${m.id || Math.random()}`, label: dayKey })
        lastDay = dayKey
      }
      out.push(m)
    }
    return out
  }, [messages])

  return (
    <div
      ref={scrollerRef}
      style={{
        position: 'relative',
        overflowY: 'auto',
        padding: 12,
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 12,
        height: '56vh',
      }}
    >
      {itemsWithSeparators.map((m) =>
        m._sep ? (
          <DaySep key={m.id} label={m.label} />
        ) : (
          <Bubble key={m.id} mine={m.sender === meId} msg={m} />
        )
      )}
    </div>
  )
}

function Bubble({ mine, msg }) {
  const time = shortTime(msg.created_at)
  const failed = msg._failed
  const pending = msg._pending

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        margin: '6px 0',
      }}
    >
      <div
        title={new Date(msg.created_at || Date.now()).toLocaleString()}
        style={{
          maxWidth: '72%',
          padding: '8px 12px',
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: mine ? 'var(--brand-teal-50)' : '#f8fafc',
          color: '#0f172a',
          boxShadow: '0 1px 2px rgba(0,0,0,.04)',
          opacity: failed ? 0.6 : 1,
        }}
      >
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.body}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <span className="muted" style={{ fontSize: 11 }}>{time}</span>
          {pending && <span className="muted" style={{ fontSize: 11 }}>(sending…)</span>}
          {failed && <span style={{ color: '#b91c1c', fontSize: 11 }}>(failed — click to retry)</span>}
        </div>
      </div>
    </div>
  )
}

function DaySep({ label }) {
  return (
    <div style={{ textAlign: 'center', margin: '10px 0' }}>
      <span
        style={{
          display: 'inline-block',
          padding: '4px 10px',
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: '#fff',
          fontSize: 12,
          color: '#334155',
        }}
      >
        {label}
      </span>
    </div>
  )
}

// Helpers
function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)

  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yest)) return 'Yesterday'
  return d.toLocaleDateString()
}

function shortTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}
