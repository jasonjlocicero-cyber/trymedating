// src/lib/analytics.js
// Tiny wrapper around Plausible for pageviews + custom events.
// Safe to call even if the script hasn't loaded yet.

export function pageview() {
  if (typeof window === 'undefined') return
  // Plausible auto-tracks pageviews when history changes (if using their SPA snippet).
  // If you added the standard script, we can still manually nudge it:
  try {
    window.plausible?.('pageview')
  } catch {}
}

export function track(eventName, props = {}) {
  if (typeof window === 'undefined') return
  try {
    // plausible('Event Name', { props: { key: 'value' } })
    window.plausible?.(eventName, { props })
  } catch {}
}
