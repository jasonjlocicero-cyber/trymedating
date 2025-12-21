// src/pwa/maybeRegisterSW.js
export async function maybeRegisterSW() {
  try {
    const mod = await import('virtual:pwa-register')
    const registerSW = mod?.registerSW
    if (typeof registerSW !== 'function') return

    registerSW({
      immediate: true,
      onRegistered() {},
      onRegisterError(err) {
        console.warn('[PWA] SW register error:', err)
      }
    })
  } catch (err) {
    // If the PWA plugin/virtual module isn't present for some reason, don't crash the app.
    console.warn('[PWA] SW setup skipped:', err)
  }
}

export default maybeRegisterSW
