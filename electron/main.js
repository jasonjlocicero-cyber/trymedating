// electron/main.js
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");

const isDev =
  !app.isPackaged ||
  process.env.NODE_ENV === "development" ||
  process.env.ELECTRON_IS_DEV === "1";

let mainWindow;

// --- Deep link state (Windows can deliver before window is ready) ---
let pendingDeepLink = null;

function isTryMeUrl(s) {
  return typeof s === "string" && s.toLowerCase().startsWith("tryme:");
}

function extractDeepLinkFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  // argv may include quotes or extra args; grab the first thing that looks like tryme:
  const found = argv.find((a) => isTryMeUrl(a) || (typeof a === "string" && a.includes("tryme:")));
  if (!found) return null;

  // Normalize a bit
  let url = String(found).trim().replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "");
  const idx = url.toLowerCase().indexOf("tryme:");
  if (idx > 0) url = url.slice(idx);
  return url;
}

function sendDeepLinkToRenderer(url) {
  if (!url) return;

  // if window isn't ready yet, stash it
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingDeepLink = url;
    return;
  }

  const sendNow = () => {
    try {
      mainWindow.webContents.send("deep-link", { url });
    } catch (e) {
      // If send fails (rare), stash and try once after load
      pendingDeepLink = url;
    }
  };

  if (mainWindow.webContents.isLoading()) {
    // wait until the page is loaded
    mainWindow.webContents.once("did-finish-load", () => {
      sendNow();
    });
  } else {
    sendNow();
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: "#ffffff",
    title: "TryMeDating",
    // In dev this path works; in packaged builds, icon handling is mostly via electron-builder config
    icon: path.join(__dirname, "..", "public", "icons", "icon.ico"),
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
      const allowed = isDev ? ["localhost", "127.0.0.1"] : []; // prod should only be file:
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
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });

    // If we received a deep link before the window was visible, forward it now
    if (pendingDeepLink) {
      const dl = pendingDeepLink;
      pendingDeepLink = null;
      sendDeepLinkToRenderer(dl);
    }
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

// --- Register protocol client (best effort in dev, reliable when installed/packaged) ---
function registerProtocolClient() {
  try {
    if (process.platform === "win32") {
      // In dev, Windows needs the exe + your script path
      if (process.defaultApp) {
        app.setAsDefaultProtocolClient("tryme", process.execPath, [path.resolve(process.argv[1])]);
      } else {
        app.setAsDefaultProtocolClient("tryme");
      }
    } else {
      app.setAsDefaultProtocolClient("tryme");
    }
  } catch (e) {
    // Don't crash the app if this fails; it can fail in dev or without install privileges
    console.warn("[protocol] setAsDefaultProtocolClient failed:", e?.message || e);
  }
}

// ✅ Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Windows: second instance is where deep link arrives while app already running
  app.on("second-instance", (_event, argv) => {
    const dl = extractDeepLinkFromArgv(argv);
    if (dl) sendDeepLinkToRenderer(dl);

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerProtocolClient();
    createMainWindow();

    // Windows: deep link when app is launched the first time via protocol
    if (process.platform === "win32") {
      const dl = extractDeepLinkFromArgv(process.argv);
      if (dl) {
        pendingDeepLink = dl;
        // If window already loaded quickly, we can attempt immediately
        sendDeepLinkToRenderer(dl);
      }
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

// macOS: deep links arrive here (both first launch and running app)
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (isTryMeUrl(url)) sendDeepLinkToRenderer(url);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ✅ Expose app version to renderer via IPC
ipcMain.handle("app:getVersion", () => app.getVersion());

