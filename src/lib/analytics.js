// src/lib/analytics.js
export function track(eventName, props = {}) {
  try {
    window.plausible && window.plausible(eventName, { props })
  } catch {}
}

export function pageview() {
  try {
    window.plausible && window.plausible('pageview')
  } catch {}
}
