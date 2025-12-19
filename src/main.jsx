// src/main.jsx
import './sentry.client.js' // Sentry bootstrap (no-op if VITE_SENTRY_DSN is unset)

import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'

// Global styles
import './index.css'
import './styles.css' // consolidated global styles

// PWA registration (vite-plugin-pwa) — web only
import { registerSW } from 'virtual:pwa-register'

// Detect Electron safely
const isElectron = !!window?.desktop?.isElectron
const isFileProtocol =
  typeof window !== 'undefined' && window.location && window.location.protocol === 'file:'

// ✅ Router choice:
// - Electron packaged runs on file:// -> HashRouter avoids pathname issues
// - Web / dev server stays BrowserRouter
const Router = isElectron || isFileProtocol ? HashRouter : BrowserRouter

// ✅ Register SW only when it makes sense (web http/https)
if (!isElectron && !isFileProtocol) {
  registerSW({ immediate: true })
}

// ✅ Desktop/Electron presence + deep-link hook (safe in browser)
;(function initDesktopBridge() {
  const d = window?.desktop
  if (!d?.isElectron) return

  // Quick visibility that the bridge is alive
  console.log('[desktop] running in Electron:', { platform: d.platform })

  // Cleanup any prior hot-reload listener (dev only)
  try {
    const prev = window.__TMD_UNSUB_DEEPLINK__
    if (typeof prev === 'function') prev()
  } catch {
    /* ignore */
  }

  // Optional: listen for deep links if your main process emits them
  const unsub = d.onDeepLink?.((payload) => {
    console.log('[desktop] deep link:', payload)
    // Routing is handled elsewhere (or add mapping here if you want)
  })

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
;







