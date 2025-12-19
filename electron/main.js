// electron/main.js
import { app, BrowserWindow, Menu } from "electron";
import path from "path";

const isDev =
  !app.isPackaged ||
  process.env.NODE_ENV === "development" ||
  process.env.TMD_DEVTOOLS === "1";

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

  // Always load built index.html (packaged-safe)
  const indexHtml = path.join(__dirname, "..", "dist", "index.html");

  // IMPORTANT: Use hash routing inside Electron
  mainWindow.loadFile(indexHtml, { hash: "/" });

  // Open DevTools reliably (and again after finish-load)
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
    mainWindow.webContents.once("did-finish-load", () => {
      if (!mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.openDevTools({ mode: "detach" });
      }
    });
  }

  // Loud logging for anything that would cause blank body
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[did-fail-load]", code, desc, url);
  });

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[render-process-gone]", details);
  });

  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  // Add a Help menu so you can open devtools even if F12 fails
  const menu = Menu.buildFromTemplate([
    ...(process.platform === "darwin"
      ? [{ label: app.name, submenu: [{ role: "quit" }] }]
      : []),
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "togglefullscreen" },
        {
          label: "Toggle DevTools",
          accelerator: process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
          click: () => mainWindow?.webContents?.toggleDevTools(),
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
;






