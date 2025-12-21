// src/pwa/maybeRegisterSW.js
export default async function maybeRegisterSW() {
  try {
    // Only register in production web builds
    if (!import.meta.env.PROD) return;
    if (!('serviceWorker' in navigator)) return;

    // Provided by vite-plugin-pwa
    const mod = await import('virtual:pwa-register');
    const registerSW = mod?.registerSW;
    if (typeof registerSW !== 'function') return;

    registerSW({
      immediate: true,
      onRegistered() {},
      onRegisterError(err) {
        console.warn('[PWA] SW register error:', err);
      }
    });
  } catch (err) {
    console.warn('[PWA] SW setup skipped:', err);
  }
}
