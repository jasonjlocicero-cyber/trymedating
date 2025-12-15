// electron/preload.js (CommonJS)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  onDeepLink: (cb) => {
    const handler = (_evt, payload) => cb(payload);
    ipcRenderer.on('deep-link', handler);
    // return an unsubscribe fn so React can clean up
    return () => ipcRenderer.removeListener('deep-link', handler);
  },
});

