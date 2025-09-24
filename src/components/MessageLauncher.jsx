import React, { useState } from 'react'

export default function MessageLauncher() {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }}>
      {/* Label */}
      {open && (
        <div style={{
          background: '#fff',
          borderRadius: 999,
          padding: '8px 14px',
          fontWeight: 600,
          fontSize: 14,
          boxShadow: '0 4px 12px rgba(0,0,0,.1)',
          transition: 'opacity 0.3s',
        }}>
          Messages
        </div>
      )}

      {/* Floating button with brand gradient */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: 'linear-gradient(135deg, var(--secondary), var(--primary))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,.2)',
          transition: 'transform 0.2s'
        }}
      >
        <span style={{ fontSize: 24, color: '#fff' }}>💬</span>
      </button>
    </div>
  )
}

