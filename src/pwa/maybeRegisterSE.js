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
    console.warn('[PWA] SW setup skipped:', err)
  }
}

export default maybeRegisterSW
