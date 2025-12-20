// electron/preload.js
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true
})


