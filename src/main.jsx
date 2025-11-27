// src/main.jsx
import './sentry.client.js' // ← Sentry bootstrap (safe no-op if VITE_SENTRY_DSN is unset)

import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// PWA registration (vite-plugin-pwa)
import { registerSW } from 'virtual:pwa-register'
registerSW({ immediate: true })

const rootEl = document.getElementById('root')
createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)


