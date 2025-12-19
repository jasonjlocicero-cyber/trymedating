// electron/main.js
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");

// ✅ DEV should be determined by packaging state, not NODE_ENV
// (NODE_ENV can be set globally on Windows and break packaged apps)
const isDev =
  process.argv.includes('--devtools') ||
  !app.isPackaged ||
  process.env.NODE_ENV === "development" ||
  process.env.ELECTRON_IS_DEV === "1";

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: "#ffffff",
    title: "TryMeDating",
    icon: path.join(__dirname, "..", "public", "icons", "icon.ico"), // ok for Windows
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // ✅ Block new-window popups; open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // ✅ Prevent navigation to random origins (phishing / redirects)
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);

      if (isDev) {
        // allow localhost only in dev
        const allowedHosts = ["localhost", "127.0.0.1"];
        if (target.protocol !== "http:" || !allowedHosts.includes(target.hostname)) {
          event.preventDefault();
        }
      } else {
        // production must be file:// only
        if (target.protocol !== "file:") event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  if (isDev) {
    // Dev: Vite server
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    mainWindow.loadURL(devUrl);
  } else {
    // Prod: load built app from dist
    // app.getAppPath() is safe in asar/unpacked
    const indexHtml = path.join(app.getAppPath(), "dist", "index.html");
    mainWindow.loadFile(indexHtml);
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  // ✅ Remove menu in production
  if (!isDev) Menu.setApplicationMenu(null);

  // ✅ Kill DevTools shortcuts in production
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!isDev && input.control && input.shift && input.key.toLowerCase() === "i") {
      event.preventDefault();
    }
    if (!isDev && input.key === "F12") {
      event.preventDefault();
    }
  });
}

app.setName("TryMeDating");

// ✅ Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ✅ Expose app version
ipcMain.handle("app:getVersion", () => app.getVersion());



