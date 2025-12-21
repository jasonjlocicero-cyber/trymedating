// src/pwa/maybeRegisterSW.js
export async function maybeRegisterSW({ isElectron = false } = {}) {
  try {
    if (isElectron) return
    if (!import.meta.env.PROD) return
    if (!('serviceWorker' in navigator)) return

    // Important: prevent Vite from trying to resolve this in dev
    const mod = await import(/* @vite-ignore */ 'virtual:pwa-register')
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

