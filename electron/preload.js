// electron/preload.js (CommonJS)
'use strict'

const { contextBridge } = require('electron')

// Values are set by electron/main.js before creating the BrowserWindow
const env = process.env.TMD_ENV || 'unknown'
const devToolsAllowed = (process.env.TMD_DEVTOOLS_ALLOWED || '0') === '1'

// Keep the surface area small + immutable
const tmdApi = Object.freeze({
  isElectron: true,
  env,
  devToolsAllowed
})

contextBridge.exposeInMainWorld('tmd', tmdApi)
