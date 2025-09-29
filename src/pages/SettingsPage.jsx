// src/pages/SettingsPage.jsx
import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const SOUND_PREF_KEY = 'chatSoundEnabled'

export default function SettingsPage({ me }) {
  const [soundEnabled, setSoundEnabled] = useState(true)
  const audioCtxRef = useRef(null)

  // Load setting from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SOUND_PREF_KEY)
      setSoundEnabled(raw == null ? true : JSON.parse(raw) === true)
    } catch {
      setSoundEnabled(true)
    }
  }, [])

  // Persist when changed
  useEffect(() => {
    try { localStorage.setItem(SOUND_PREF_KEY, JSON.stringify(!!soundEnabled)) } catch {}
  }, [soundEnabled])

  // Simple WebAudio chime (same vibe as the toast)
  function ensureAudioCtx() {
    if (audioCtxRef.current) return audioCtxRef.current
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      audioCtxRef.current = new Ctx()
      return audioCtxRef.current
    } catch { return null }
  }

  function playChime() {
    if (!soundEnabled) return
    const ctx = ensureAudioCtx()
    if (!ctx) return
    try {
      const now = ctx.currentTime
      const master = ctx.createGain()
      master.gain.value = 0.00001
      master.connect(ctx.destination)

      const note = (t, f, dur = 0.22, g = 0.6) => {
        const osc = ctx.createOscillator()
        const gn = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(f, t)
        osc.connect(gn); gn.connect(master)
        gn.gain.setValueAtTime(0.00001, t)
        gn.gain.exponentialRampToValueAtTime(g, t + 0.02)
        gn.gain.exponentialRampToValueAtTime(0.00001, t + dur)
        osc.start(t); osc.stop(t + dur + 0.02)
      }

      master.gain.setValueAtTime(0.00001, now)
      master.gain.exponentialRampToValueAtTime(0.9, now + 0.02)
      master.gain.exponentialRampToValueAtTime(0.00001, now + 0.8)

      // A4 -> C#5 two-note chime
      note(now + 0.00, 440, 0.22, 0.5)
      note(now + 0.18, 554.37, 0.28, 0.45)
    } catch { /* ignore */ }
  }

  async function handleSignOut() {
    try { await supabase.auth.signOut() } catch {}
    window.location.href = '/'
  }

  return (
    <div className="container" style={{ padding: '24px 0', maxWidth: 860 }}>
      <h1 style={{ marginTop: 0 }}>Settings</h1>

      {/* Notifications */}
      <section className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Notifications</h2>
        <div style={{ display:'grid', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div>
              <div style={{ fontWeight: 700 }}>Message alert sound</div>
              <div className="muted" style={{ fontSize: 13 }}>
                Plays a soft chime when a new message toast appears (when chat is closed or in another thread).
              </div>
            </div>
            <label style={{ display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
              />
              <span>{soundEnabled ? 'On' : 'Off'}</span>
            </label>
          </div>

          <div>
            <button
              className="btn"
              type="button"
              onClick={() => {
                // Try to resume audio on user gesture (mobile autoplay)
                const ctx = ensureAudioCtx()
                if (ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{})
                playChime()
              }}
              disabled={!soundEnabled}
            >
              Test sound
            </button>
          </div>
        </div>
      </section>

      {/* Account */}
      <section className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Account</h2>
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
          Signed in as {me?.email || 'your account'}.
        </div>
        <button className="btn" onClick={handleSignOut}>Sign out</button>
      </section>

      {/* Danger Zone (optional: delete account function if you wired it) */}
      <section className="card" style={{ marginTop: 12, borderLeft: '4px solid #ef4444' }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Danger Zone</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Permanently delete your account and data.
        </p>
        <button
          className="btn"
          style={{ borderColor:'#ef4444', color:'#ef4444' }}
          onClick={async () => {
            if (!confirm('Delete your account permanently?')) return
            try {
              const res = await fetch('/.netlify/functions/delete-account', { method:'POST' })
              if (!res.ok) throw new Error('Delete failed')
              alert('Your account was deleted.')
              await supabase.auth.signOut()
              window.location.href = '/'
            } catch (e) {
              alert('Sorry, could not delete your account.')
            }
          }}
        >
          Delete account
        </button>
      </section>
    </div>
  )
}





