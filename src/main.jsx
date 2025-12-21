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
// Also IMPORTANT: do NOT reference 'virtual:pwa-register' from main.jsx,
// or Vite dev can error if the plugin isn’t active in that mode.
if (!isElectron && import.meta.env.PROD) {
  import('./pwa/registerSW')
    .then((m) => m.registerTmdSW?.())
    .catch((err) => console.warn('[PWA] registerSW import failed:', err))
}

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
;
















