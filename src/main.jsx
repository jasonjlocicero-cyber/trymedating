// src/main.jsx
import './sentry.client.js'; // Sentry bootstrap (no-op if VITE_SENTRY_DSN is unset)

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';

// Global styles
import './index.css';
import './styles.css';

// ✅ Detect Electron safely
const isElectron = !!window?.desktop?.isElectron;

// PWA registration (vite-plugin-pwa)
// IMPORTANT: Do NOT register SW inside Electron
if (!isElectron) {
  // dynamic import WITHOUT top-level await
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch((err) => {
      console.warn('[pwa] registerSW skipped/failed:', err);
    });
}

// ✅ Desktop/Electron presence + deep-link hook (safe in browser)
(function initDesktopBridge() {
  const d = window?.desktop;
  if (!d?.isElectron) return;

  console.log('[desktop] running in Electron:', { platform: d.platform });

  const unsub = d.onDeepLink?.((payload) => {
    console.log('[desktop] deep link:', payload);
  });

  window.__TMD_UNSUB_DEEPLINK__ = unsub;
})();

const rootEl = document.getElementById('root');
const Router = isElectron ? HashRouter : BrowserRouter;

createRoot(rootEl).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);











