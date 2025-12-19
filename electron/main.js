// electron/main.js
import { app, BrowserWindow, globalShortcut, Menu } from "electron";
import path from "path";

const DEVTOOLS = process.env.TMD_DEVTOOLS === "1";

// Tell Electron where to load in dev (you can set this in scripts/env)
const DEV_SERVER_URL = process.env.TMD_DEV_SERVER_URL || "http://localhost:5173";

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true, // IMPORTANT: allow devtools
    },
  });

  // ✅ Load dev server when not packaged OR when explicitly provided
  if (!app.isPackaged) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    // ✅ PROD: load built index.html safely
    const indexHtml = path.join(__dirname, "..", "dist", "index.html");
    // Force hash router mount point
    win.loadFile(indexHtml, { hash: "/" });
  }

  // Always log load failures
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[did-fail-load]", code, desc, url);
  });

  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[render-process-gone]", details);
  });

  // ✅ Open devtools *after* the page finishes loading (important)
  win.webContents.once("did-finish-load", () => {
    if (DEVTOOLS) {
      win.webContents.openDevTools({ mode: "detach" });
    }
  });

  // ✅ Add a basic menu so DevTools is always accessible
  const template = [
    ...(process.platform === "darwin"
      ? [{ label: app.name, submenu: [{ role: "quit" }] }]
      : []),
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  createWindow();

  // ✅ Hard guarantee devtools shortcut works
  globalShortcut.register("CommandOrControl+Shift+I", () => {
    if (win && !win.isDestroyed()) win.webContents.toggleDevTools();
  });
  globalShortcut.register("F12", () => {
    if (win && !win.isDestroyed()) win.webContents.toggleDevTools();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});






