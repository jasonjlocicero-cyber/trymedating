// electron/preload.js (CommonJS)
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform
  // In future we can expose safe IPC methods here.
});
