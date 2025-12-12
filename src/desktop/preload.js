// src/desktop/preload.js
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true
});
