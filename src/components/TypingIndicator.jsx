// src/components/TypingIndicator.jsx
import React from 'react'

/**
 * Tiny typing indicator that shows "Jason is typing…" style text.
 * Use it only when someone ELSE (not you) is typing.
 */
export default function TypingIndicator({ names = [] }) {
  if (!names.length) return null
  const label =
    names.length === 1 ? `${names[0]} is typing…`
    : names.length === 2 ? `${names[0]} and ${names[1]} are typing…`
    : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more are typing…`

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        fontSize: 12,
        color: '#334155',
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex', gap: 3 }}>
        <Dot/><Dot delay={120}/><Dot delay={240}/>
      </span>
      <span className="muted">{label}</span>
    </div>
  )
}

function Dot({ delay = 0 }) {
  return (
    <span
      style={{
        width: 6, height: 6, borderRadius: 999, background: 'var(--brand-teal)',
        display: 'inline-block', animation: `tmd-bounce 1s infinite`, animationDelay: `${delay}ms`
      }}
    />
  )
}
