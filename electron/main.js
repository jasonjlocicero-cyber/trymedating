// electron/main.js
import { app, BrowserWindow, globalShortcut } from "electron";
import path from "path";

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Helpful diagnostics
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[did-fail-load]", code, desc, url);
  });

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[render-process-gone]", details);
  });

  // DEV vs PROD load
  const isDev = !app.isPackaged;

  if (isDev) {
    // Vite dev server. HashRouter works fine here too.
    mainWindow.loadURL("http://localhost:5173/#/");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Packaged: load built file and force hash route root
    const indexHtml = path.join(__dirname, "..", "dist", "index.html");
    mainWindow.loadFile(indexHtml, { hash: "/" });
  }
}

app.whenReady().then(() => {
  createWindow();

  // ✅ ALWAYS allow devtools shortcuts
  globalShortcut.register("F12", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });

  globalShortcut.register("CommandOrControl+Shift+I", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});






