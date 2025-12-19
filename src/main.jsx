// src/main.jsx
import './sentry.client.js'; // Sentry bootstrap (no-op if VITE_SENTRY_DSN is unset)

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Global styles
import './index.css';
import './styles.css'; // ensure our consolidated global styles are loaded

// PWA registration (vite-plugin-pwa)
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });

// ✅ Desktop/Electron presence + deep-link hook (safe in browser)
(function initDesktopBridge() {
  const d = window?.desktop;
  if (!d?.isElectron) return;

  // Quick visibility that the bridge is alive
  console.log('[desktop] running in Electron:', {
    platform: d.platform,
  });

  // Optional: listen for deep links if your main process emits them
  // (preload exposes onDeepLink() unsubscribe pattern)
  const unsub = d.onDeepLink?.((payload) => {
    console.log('[desktop] deep link:', payload);
    // TODO: route or handle payload here if needed
  });

  // If you ever need cleanup on hot reload, keep a reference
  window.__TMD_UNSUB_DEEPLINK__ = unsub;
})();

const rootEl = document.getElementById('root');
createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);



