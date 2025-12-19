// electron/main.js
const { app, BrowserWindow, Menu, shell, ipcMain, crashReporter, session } = require("electron");
const path = require("path");

const isDev =
  !app.isPackaged ||
  process.env.NODE_ENV === "development" ||
  process.env.ELECTRON_IS_DEV === "1";

let mainWindow;

// ----------------------
// Crash + hard-fail logging
// ----------------------
function startCrashReporter() {
  // This does NOT send anywhere unless you configure submitURL.
  // It still generates local crash dumps, which helps stability debugging.
  try {
    crashReporter.start({
      productName: "TryMeDating",
      companyName: "TryMeDating",
      submitURL: "", // keep empty for now (local only)
      uploadToServer: false,
      compress: true,
    });
  } catch {
    // ignore if crashReporter unavailable
  }
}

function wireProcessGuards() {
  process.on("uncaughtException", (err) => {
    console.error("[main] uncaughtException:", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[main] unhandledRejection:", reason);
  });

  app.on("render-process-gone", (_event, webContents, details) => {
    console.error("[main] render-process-gone:", details);
    // If a renderer crashes, try to recover by reloading
    try {
      if (!isDev && webContents) webContents.reload();
    } catch {}
  });

  app.on("child-process-gone", (_event, details) => {
    console.error("[main] child-process-gone:", details);
  });
}

// ----------------------
// Security helpers
// ----------------------
function isAllowedDevURL(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: "#ffffff",
    title: "TryMeDating",
    icon: path.join(__dirname, "..", "public", "icons", "icon.ico"), // Windows OK
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDev, // ✅ DevTools only in dev
    },
  });

  // ✅ Always open external links in system browser (never inside app)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // ✅ Block unexpected navigation
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isDev) {
      // allow dev server only
      if (!isAllowedDevURL(url)) event.preventDefault();
      return;
    }

    // production: only allow local file://
    try {
      const target = new URL(url);
      if (target.protocol !== "file:") event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  // ✅ Permission hard-deny (tightens stability & security)
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));

  // ✅ Basic CSP header in production (keeps renderer predictable)
  // Note: your Vite build should work with this; if you later add inline scripts, adjust.
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const csp = [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self' https://*.supabase.co https://*.sentry.io",
        "font-src 'self' data:",
      ].join("; ");

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [csp],
        },
      });
    });
  }

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  // ✅ Remove menu in production
  if (!isDev) Menu.setApplicationMenu(null);

  // ✅ Kill DevTools shortcuts in production (belt & suspenders)
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

// ✅ Helps Windows identity & installer behavior
try {
  app.setAppUserModelId("com.trymedating.desktop");
} catch {}

startCrashReporter();
wireProcessGuards();

// ✅ Single-instance lock (prevents multiple apps fighting storage/protocol)
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

// ✅ Expose app version to renderer
ipcMain.handle("app:getVersion", () => app.getVersion());


