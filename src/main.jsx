// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Reliable Electron detection:
// - In Electron, preload should expose window.tmd.isElectron (recommended)
// - In packaged builds, protocol will be file: (also true)
const isFileProtocol = window?.location?.protocol === 'file:'
const isElectronFromPreload =
  Boolean(window?.tmd?.isElectron) || // recommended preload key
  Boolean(window?.desktop?.isElectron) || // legacy pattern
  Boolean(window?.electron) || // legacy pattern
  Boolean(window?.isElectron) // fallback if set elsewhere

const isElectron = isFileProtocol || isElectronFromPreload

// IMPORTANT: PWA/SW should NOT run in Electron.
// Also: avoid virtual:pwa-register entirely (it breaks if the plugin isn't active in dev).
async function maybeRegisterSW() {
  try {
    if (isElectron) return
    if (!import.meta.env.PROD) return
    if (!('serviceWorker' in navigator)) return

    // vite-plugin-pwa typically outputs /sw.js in the site root.
    // If it doesn't exist for some reason, this will fail safely and your app still runs.
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (err) {
    console.warn('[PWA] SW register skipped:', err)
  }
}

maybeRegisterSW()

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Root element #root not found')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    {isElectron ? (
      <HashRouter>
        <App />
      </HashRouter>
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>
)



















