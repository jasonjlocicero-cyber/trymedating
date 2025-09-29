// src/pages/SettingsPage.jsx
import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const SOUND_PREF_KEY = 'chatSoundEnabled'

export default function SettingsPage({ me }) {
  const [soundEnabled, setSoundEnabled] = useState(true)
  const audioCtxRef = useRef(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SOUND_PREF_KEY)
      setSoundEnabled(raw == null ? true : JSON.parse(raw) === true)
    } catch { setSoundEnabled(true) }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(SOUND_PREF_KEY, JSON.stringify(!!soundEnabled)) } catch {}
  }, [soundEnabled])

  function ensureAudioCtx() {
    if (audioCtxRef.current) return audioCtxRef.current
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      audioCtxRef.current = new Ctx()
      return audioCtxRef.current
    } catch { return null }
  }
  function testChime() {
    if (!soundEnabled) return
    const ctx = ensureAudioCtx()
    if (!ctx) return
    try {
      const now = ctx.currentTime
      const master = ctx.createGain(); master.gain.value = 0.00001; master.connect(ctx.destination)
      const note = (t, f, dur = 0.22, g = 0.6) => {
        const o = ctx.createOscillator(), g1 = ctx.createGain()
        o.type='sine'; o.frequency.setValueAtTime(f, t); o.connect(g1); g1.connect(master)
        g1.gain.setValueAtTime(0.00001, t)
        g1.gain.exponentialRampToValueAtTime(g, t + 0.02)
        g1.gain.exponentialRampToValueAtTime(0.00001, t + dur)
        o.start(t); o.stop(t + dur + 0.02)
      }
      master.gain.setValueAtTime(0.00001, now)
      master.gain.exponentialRampToValueAtTime(0.9, now + 0.02)
      master.gain.exponentialRampToValueAtTime(0.00001, now + 0.8)
      note(now + 0.00, 440, 0.22, 0.5); note(now + 0.18, 554.37, 0.28, 0.45)
    } catch {}
  }

  async function handleSignOut() {
    try { await supabase.auth.signOut() } catch {}
    window.location.href = '/'
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 720 }}>
      <h1>Settings</h1>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Notifications</h2>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Message alert sound</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Play a soft chime when a new message toast appears.
            </div>
          </div>
          <label style={{ display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <input type="checkbox" checked={soundEnabled} onChange={(e)=>setSoundEnabled(e.target.checked)} />
            <span>{soundEnabled ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            className="btn"
            onClick={() => {
              const ctx = ensureAudioCtx()
              if (ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{})
              testChime()
            }}
            disabled={!soundEnabled}
          >
            Test sound
          </button>
        </div>
      </section>

      <section className="card" style={{ padding: 16, marginTop: 12 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Account</h2>
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
          Signed in as {me?.email || '—'}.
        </div>
        <button className="btn" onClick={handleSignOut}>Sign out</button>
      </section>
    </div>
  )
}





