// src/pwa/maybeRegisterSW.js
export default async function maybeRegisterSW({ isElectron } = {}) {
  try {
    if (isElectron) return
    if (!import.meta.env.PROD) return
    if (!('serviceWorker' in navigator)) return

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
    // If PWA plugin isn't included in this build, this import can fail — that's fine.
    console.warn('[PWA] SW setup skipped:', err)
  }
}




