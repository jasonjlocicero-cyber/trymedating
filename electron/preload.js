// electron/preload.js
// We’re not exposing any powerful Node APIs to the renderer.
// This keeps the surface area tiny and safe with contextIsolation.
(() => {
  // You can expose a minimal, safe API here later with:
  // contextBridge.exposeInMainWorld('tmd', { ping: () => 'pong' })
})();
