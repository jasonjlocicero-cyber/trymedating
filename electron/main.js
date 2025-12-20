/* electron/main.js - CommonJS main process entry
   Fixes: packaged EXE crashing due to ESM "import" syntax
   Adds: deterministic devtools gating + load-path logging + fail/crash diagnostics
*/

const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

function getRuntimeFlags() {
  const isDev = !app.isPackaged;

  // Dev server URL can be passed in (your script already sets this for desktop:dev)
  const devServerUrl = process.env.TMD_DEV_SERVER_URL;

  // DevTools behavior: deterministic
  // - default: enabled in dev, disabled in packaged
  // - override: set TMD_DEVTOOLS=1 to allow in packaged
  const allowDevTools =
    process.env.TMD_DEVTOOLS === "1" || (isDev && process.env.TMD_DEVTOOLS !== "0");

  // Auto-open devtools only when explicitly allowed
  // - default: auto-open in dev if devtools allowed
  // - override: TMD_OPEN_DEVTOOLS=0 disables auto-open
  const openDevTools =
    allowDevTools && (process.env.TMD_OPEN_DEVTOOLS ?? (isDev ? "1" : "0")) !== "0";

  return { isDev, devServerUrl, allowDevTools, openDevTools };
}

function resolveIndexHtmlPath() {
  // In packaged app.asar: __dirname -> .../resources/app.asar/electron
  // dist is included by electron-builder "files": ["electron/**","dist/**",...]
  return path.join(__dirname, "..", "dist", "index.html");
}

function createMainWindow() {
  const { isDev, devServerUrl, allowDevTools, openDevTools } = getRuntimeFlags();

  // Expose a simple env flag to preload if you want it
  process.env.TMD_ENV = isDev ? "development" : "production";
  process.env.TMD_DEVTOOLS = allowDevTools ? "1" : "0";

  const preloadPath = path.join(__dirname, "preload.js");
  const indexHtmlPath = resolveIndexHtmlPath();

  console.log(
    `[TMD] Starting... isPackaged=${app.isPackaged} isDev=${isDev} allowDevTools=${allowDevTools} openDevTools=${openDevTools}`
  );
  console.log(`[TMD] preloadPath=${preloadPath}`);
  console.log(`[TMD] indexHtmlPath=${indexHtmlPath}`);

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      devTools: allowDevTools // hard gate
    }
  });

  // Always push external links to the OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Deterministically block devtools toggles when disabled
  win.webContents.on("before-input-event", (event, input) => {
    const isToggle =
      input.type === "keyDown" &&
      (
        input.key === "F12" ||
        ((input.control || input.meta) && input.shift && (input.key === "I" || input.code === "KeyI"))
      );

    if (!allowDevTools && isToggle) {
      event.preventDefault();
    }
  });

  // Load URL/file deterministically
  if (isDev) {
    const urlToLoad = devServerUrl || "http://localhost:5173";
    console.log(`[TMD] DEV loadURL => ${urlToLoad}`);
    win.loadURL(urlToLoad);
  } else {
    console.log(`[TMD] PROD loadFile => ${indexHtmlPath}`);
    win.loadFile(indexHtmlPath);
  }

  // Diagnostics: never silently fail again
  win.webContents.on("did-finish-load", () => {
    console.log(`[TMD] did-finish-load URL=${win.webContents.getURL()}`);
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      console.error(
        `[TMD] did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`
      );
    }
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      `[TMD] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`
    );
  });

  win.on("ready-to-show", () => {
    win.show();
    if (openDevTools) {
      win.webContents.openDevTools({ mode: "detach" });
    }
  });

  return win;
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});









