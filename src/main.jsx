// src/main.jsx
import './sentry.client.js'; // Sentry bootstrap (no-op if VITE_SENTRY_DSN is unset)

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';

// Global styles
import './index.css';
import './styles.css';

// PWA registration (vite-plugin-pwa)
// NOTE: In Electron (file://), SW won’t really apply, but leaving this is fine.
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });

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

// ✅ Key fix: BrowserRouter breaks on file:// (Electron unpacked/installed).
// Use HashRouter in Electron or when protocol is file:
const isElectron = !!window?.desktop?.isElectron;
const isFileProtocol = typeof window !== 'undefined' && window.location?.protocol === 'file:';
const Router = (isElectron || isFileProtocol) ? HashRouter : BrowserRouter;

createRoot(rootEl).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);










