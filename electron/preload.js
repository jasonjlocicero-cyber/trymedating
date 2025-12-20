/* electron/preload.js - CommonJS preload
   Exposes minimal safe runtime flags to the renderer.
*/

const { contextBridge } = require("electron");

const env = process.env.TMD_ENV || "unknown";
const devToolsAllowed = (process.env.TMD_DEVTOOLS || "0") === "1";

contextBridge.exposeInMainWorld("tmd", {
  isElectron: true,
  env,
  devToolsAllowed,
  platform: process.platform
});




