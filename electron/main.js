// electron/main.js
import { app, BrowserWindow, globalShortcut } from "electron";
import path from "path";

const DEVTOOLS = process.env.TMD_DEVTOOLS === "1";

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), // keep yours
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ✅ Option A: use live site in packaged builds (fastest "done today" fix)
  if (app.isPackaged) {
    mainWindow.loadURL("https://trymedating.com/");
  } else {
    // Dev: load Vite dev server
    mainWindow.loadURL("http://localhost:5173/");
  }

  // Debug helpers (packaged-safe)
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[did-fail-load]", code, desc, url);
  });

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[render-process-gone]", details);
  });

  // ✅ Devtools behavior:
  // - If TMD_DEVTOOLS=1 -> open on launch
  // - Always allow toggling with Ctrl+Shift+I (even packaged)
  if (DEVTOOLS && mainWindow) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // Per-window hotkey (works even if globalShortcut fails)
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    const key = (input.key || "").toLowerCase();
    const toggle =
      input.type === "keyDown" &&
      input.control &&
      input.shift &&
      key === "i";

    if (toggle && mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Extra safety: global shortcut too (some environments prefer this)
  globalShortcut.register("Control+Shift+I", () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Standard behavior: quit on Windows/Linux, keep alive on macOS
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});




