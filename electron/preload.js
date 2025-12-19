// electron/preload.js (CommonJS)
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,

  // ✅ Don't rely on Node's process in the renderer. Expose the value from preload instead.
  platform: process.platform,

  // ✅ Deep link payloads from main -> renderer
  onDeepLink: (cb) => {
    const handler = (_evt, payload) => cb(payload);
    ipcRenderer.on("deep-link", handler);
    return () => ipcRenderer.removeListener("deep-link", handler);
  },

  // ✅ App version (comes from main via IPC)
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
});


