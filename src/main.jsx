// src/main.jsx
import './sentry.client.js' // Sentry bootstrap (no-op if VITE_SENTRY_DSN is unset)

import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'

// Global styles
import './index.css'
import './styles.css' // consolidated global styles

// PWA registration (vite-plugin-pwa)
import { registerSW } from 'virtual:pwa-register'

// Detect Electron / file:// (packaged desktop)
const isElectron = !!window?.desktop?.isElectron
const isFileProtocol = window?.location?.protocol === 'file:'

// ✅ Router choice:
// - Web (Netlify): BrowserRouter
// - Electron (file://): HashRouter (prevents blank route issues under file protocol)
const Router = isElectron || isFileProtocol ? HashRouter : BrowserRouter

// ✅ Only register the service worker on real web origins (http/https), not Electron/file://
if (!isElectron && !isFileProtocol) {
  registerSW({ immediate: true })
}

// ✅ Optional: Desktop bridge visibility (safe everywhere)
;(function initDesktopBridge() {
  const d = window?.desktop
  if (!d?.isElectron) return

  console.log('[desktop] running in Electron:', { platform: d.platform })

  const unsub = d.onDeepLink?.((payload) => {
    console.log('[desktop] deep link:', payload)
    // Deep-link routing is handled in App.jsx (and/or your hook), so we just log here.
  })

  // For dev hot reload cleanup if needed
  window.__TMD_UNSUB_DEEPLINK__ = unsub
})()

const rootEl = document.getElementById('root')
createRoot(rootEl).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
)








