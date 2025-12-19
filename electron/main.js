// electron/main.js
const { app, BrowserWindow, globalShortcut } = require("electron");
const path = require("path");

function hasDevtoolsFlag() {
  return process.argv.includes("--devtools") || process.env.TMD_DEVTOOLS === "1";
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const indexHtml = path.join(__dirname, "..", "dist", "index.html");

  // With HashRouter, this is all you need:
  win.loadFile(indexHtml);

  // --- Debug helpers ---
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[did-fail-load]", code, desc, url);
  });

  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[render-process-gone]", details);
  });

  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    // Handy when devtools isn’t open yet
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  // Open devtools if flagged, or if running unpacked with env/args
  if (hasDevtoolsFlag()) {
    win.webContents.openDevTools({ mode: "detach" });
  }

  // Always provide hotkeys for devtools (packaged-safe)
  win.once("ready-to-show", () => {
    try {
      globalShortcut.register("F12", () => {
        if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
        else win.webContents.openDevTools({ mode: "detach" });
      });

      globalShortcut.register("CommandOrControl+Shift+I", () => {
        if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
        else win.webContents.openDevTools({ mode: "detach" });
      });
    } catch (e) {
      console.error("[globalShortcut] failed:", e);
    }
  });

  win.on("closed", () => {
    try {
      globalShortcut.unregisterAll();
    } catch {}
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});






