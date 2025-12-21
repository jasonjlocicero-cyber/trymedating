// electron/preload.js (CommonJS)
// Keep preload minimal and safe

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("tmd", {
  isElectron: true,
  env: process.env.TMD_ENV || "unknown",
  devToolsAllowed: (process.env.TMD_DEVTOOLS_ALLOWED || "0") === "1"
});




