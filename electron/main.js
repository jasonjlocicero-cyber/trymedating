// electron/main.js
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");

const isDev =
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
    icon: path.join(__dirname, "..", "public", "icons", "icon.ico"), // OK on Windows
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // ✅ Block new-window popups; open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // ✅ Prevent navigation to random origins (phishing / unexpected redirects)
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      const allowed = isDev
        ? ["localhost", "127.0.0.1"]
        : []; // in prod you should only load local files
      if (!isDev && target.protocol !== "file:") {
        event.preventDefault();
      }
      if (isDev && target.protocol !== "http:") {
        // keep dev simple
        return;
      }
      if (isDev && !allowed.includes(target.hostname)) {
        event.preventDefault();
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
    // Prod: Vite build output
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  // ✅ Remove menu in production (cleaner + fewer shortcuts)
  if (!isDev) Menu.setApplicationMenu(null);

  // ✅ Kill DevTools in production even if a shortcut tries to open it
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

// ✅ Single-instance lock (prevents multiple apps fighting over storage/protocols)
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

// ✅ Expose app version to renderer via IPC (so you can display it in the UI)
ipcMain.handle("app:getVersion", () => app.getVersion());

