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
// Also IMPORTANT: Keep the PWA virtual import out of the dev module graph.
// We do that by only importing our PWA helper file in PROD.
if (!isElectron && import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('./pwa/maybeRegisterSW')
    .then((m) => {
      const fn = m?.default || m?.maybeRegisterSW
      if (typeof fn === 'function') fn()
    })
    .catch((err) => {
      console.warn('[PWA] SW setup skipped:', err)
    })
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  // Fail loudly instead of silently doing nothing
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
















