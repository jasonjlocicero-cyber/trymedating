// src/lib/analytics.js
// Tiny wrapper around Plausible for pageviews + custom events.
// Also mirrors calls into an in-memory log for the Debug Panel.

function pushDebug(event) {
  try {
    const list = (window.__eventsDebug = window.__eventsDebug || [])
    list.push({ ...event, t: new Date().toISOString() })
    // notify listeners
    window.dispatchEvent(new CustomEvent('__eventsDebugAppend', { detail: event }))
  } catch {}
}

export function pageview() {
  if (typeof window === 'undefined') return
  try { window.plausible?.('pageview') } catch {}
  pushDebug({ type: 'pageview', name: 'pageview', props: {} })
}

export function track(eventName, props = {}) {
  if (typeof window === 'undefined') return
  try { window.plausible?.(eventName, { props }) } catch {}
  pushDebug({ type: 'event', name: eventName, props: props || {} })
}
