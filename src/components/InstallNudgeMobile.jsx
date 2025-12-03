import React, { useEffect, useState } from 'react'
import { isStandaloneDisplayMode } from '../lib/pwa'

const isiOS = () =>
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream

export default function InstallNudgeMobile() {
  const [installed, setInstalled] = useState(isStandaloneDisplayMode())
  const [show, setShow] = useState(false)
  const [hasPrompt, setHasPrompt] = useState(false)

  useEffect(() => {
    const onBIP = (e) => {
      e.preventDefault()
      setHasPrompt(true)
      // show once per session if not installed
      if (!installed) setShow(true)
    }
    const onInstalled = () => {
      setInstalled(true)
      setShow(false)
    }
    const recheck = () => setInstalled(isStandaloneDisplayMode())

    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('visibilitychange', recheck)
    window.addEventListener('resize', recheck)

    // iOS has no BIP; show gentle guidance the first time
    if (isiOS() && !installed) setShow(true)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('resize', recheck)
    }
  }, [installed])

  if (installed || !show) return null

  // Very light, dismissible hint; style is up to you
  return (
    <div style={{
      position: 'fixed',
      left: 12,
      right: 12,
      bottom: 12,
      zIndex: 50,
      border: '1px solid var(--border)',
      background: '#fff',
      borderRadius: 12,
      boxShadow: '0 6px 20px rgba(0,0,0,.08)',
      padding: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }}>
      <div style={{ fontWeight: 700 }}>Install TryMeDating</div>
      <div className="muted" style={{ fontSize: 13 }}>
        {isiOS()
          ? 'iOS: Share → Add to Home Screen'
          : (hasPrompt
              ? 'Tap Install in the banner'
              : 'Chrome/Edge: use the address bar Install icon')}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => setShow(false)} style={{ marginLeft: 'auto' }}>
        Dismiss
      </button>
    </div>
  )
}

