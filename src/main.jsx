// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Detect Electron / file://
// - window.desktop?.isElectron is something you can expose from preload
// - file:// is the big one for packaged builds
const isElectron =
  !!window?.desktop?.isElectron ||
  window?.navigator?.userAgent?.toLowerCase?.().includes('electron') ||
  window?.location?.protocol === 'file:'

const Router = isElectron ? HashRouter : BrowserRouter

// ✅ PWA registration:
// - DO NOT register service worker inside Electron / file://
// - Only register on https or localhost (normal web behavior)
async function maybeRegisterPWA() {
  try {
    if (isElectron) return

    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'

    const isSecure = window.location.protocol === 'https:' || isLocalhost
    if (!isSecure) return

    // IMPORTANT: no top-level await, and this stays out of Electron
    const { registerSW } = await import('virtual:pwa-register')

    registerSW({
      immediate: true,
      onNeedRefresh() {
        // optional: you can show a toast/modal later
        console.log('[PWA] Update available (refresh needed)')
      },
      onOfflineReady() {
        console.log('[PWA] Offline ready')
      }
    })
  } catch (e) {
    console.warn('[PWA] register failed:', e)
  }
}

maybeRegisterPWA()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
)












