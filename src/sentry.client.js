// Lightweight Sentry setup for Vite + React.
// Requires: npm i @sentry/react
// Configure DSN: set VITE_SENTRY_DSN in Netlify env (and optionally in GitHub secrets)

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN;
if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE || 'production',
    // Keep this low unless you want performance traces:
    tracesSampleRate: 0.05,
    // Don’t record sessions/replays unless you explicitly want them:
    replaysSessionSampleRate: 0.0,
    beforeSend(event) {
      // Extra hardening: scrub obvious PII-like fields if any slip in
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
        delete event.user.username;
      }
      return event;
    },
  });
}
