// src/main.jsx
import './sentry.client.js' // Sentry bootstrap (no-op if VITE_SENTRY_DSN is unset)

import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'

// Global styles
import './index.css'
import './styles.css' // ensure our consolidated global styles are loaded

// PWA registration (vite-plugin-pwa) — browser only (NOT Electron / NOT file://)
function registerPwaSafely() {
  try {
    const isElectron = !!window?.desktop?.isElectron
    const isFile = window?.location?.protocol === 'file:'
    if (isElectron || isFile) return
    if (!('serviceWorker' in navigator)) return

    // Dynamic import so Electron/file:// never even evaluates the module
    import('virtual:pwa-register')
      .then(({ registerSW }) => registerSW({ immediate: true }))
      .catch(() => {})
  } catch {
    // no-op
  }
}
registerPwaSafely()

// ✅ Desktop/Electron presence + deep-link hook (safe in browser)
;(function initDesktopBridge() {
  const d = window?.desktop
  if (!d?.isElectron) return

  console.log('[desktop] running in Electron:', { platform: d.platform })

  const unsub = d.onDeepLink?.((payload) => {
    console.log('[desktop] deep link:', payload)
    // routing is handled inside the app via HashRouter + your app routes
  })

  window.__TMD_UNSUB_DEEPLINK__ = unsub
})()

// ✅ Router choice:
// - BrowserRouter for real web (Netlify)
// - HashRouter for Electron/file:// so routes work reliably
const Router = window?.desktop?.isElectron ? HashRouter : BrowserRouter

const rootEl = document.getElementById('root')
createRoot(rootEl).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
)






