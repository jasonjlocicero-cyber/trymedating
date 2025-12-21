// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import maybeRegisterSW from './pwa/maybeRegisterSW'

// Reliable Electron detection:
// - In Electron, preload should expose window.tmd.isElectron (recommended)
// - In packaged builds, protocol will be file: (also true)
const isFileProtocol = window?.location?.protocol === 'file:'
const isElectronFromPreload =
  Boolean(window?.tmd?.isElectron) ||
  Boolean(window?.desktop?.isElectron) ||
  Boolean(window?.electron) ||
  Boolean(window?.isElectron)

const isElectron = isFileProtocol || isElectronFromPreload

// PWA/SW should NOT run in Electron.
maybeRegisterSW({ isElectron })

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

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




















