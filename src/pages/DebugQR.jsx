// src/pages/DebugQR.jsx
import React from 'react'
import QRShareCard from '../components/QRShareCard'

export default function DebugQR() {
  const value = `${window.location.origin}/connect?demo=1`
  return (
    <div className="container" style={{ padding: '24px 0', maxWidth: 720 }}>
      <h1 style={{ marginBottom: 8 }}>QR Debug</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        This page renders a QR without touching Supabase. If you see a QR here, the component & CSS are fine.
      </p>
      <QRShareCard value={value} label="Scan this test QR" />
    </div>
  )
}

