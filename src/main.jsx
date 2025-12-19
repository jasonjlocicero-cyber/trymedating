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
// IMPORTANT: Do NOT register SW inside Electron (file:// + SW can cause weirdness)
const isElectron = !!window?.desktop?.isElectron;
if (!isElectron) {
  // eslint-disable-next-line import/no-unresolved
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}

// ✅ Desktop/Electron presence + deep-link hook (safe in browser)
(function initDesktopBridge() {
  const d = window?.desktop;
  if (!d?.isElectron) return;

  console.log('[desktop] running in Electron:', { platform: d.platform });

  const unsub = d.onDeepLink?.((payload) => {
    console.log('[desktop] deep link:', payload);
    // TODO: route/handle payload here if needed
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










