// electron/main.js (CommonJS)
// Fixes packaged EXE crash: "Cannot use import statement outside a module"
// Adds deterministic dev/prod load + deterministic DevTools gating + logging

const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

function getRuntimeFlags() {
  const isDev = !app.isPackaged;

  // Your scripts use TMD_DEV_SERVER_URL and TMD_DEVTOOLS
  const devServerUrl = process.env.TMD_DEV_SERVER_URL || "";
  const devToolsEnv = process.env.TMD_DEVTOOLS;

  // Deterministic DevTools:
  // - In dev (not packaged): default allow unless explicitly disabled (TMD_DEVTOOLS=0)
  // - In packaged: default deny unless explicitly enabled (TMD_DEVTOOLS=1)
  const allowDevTools = isDev ? devToolsEnv !== "0" : devToolsEnv === "1";

  // Auto-open DevTools:
  // - In dev: default open
  // - In packaged: default do NOT open
  const openDevTools =
    process.env.TMD_OPEN_DEVTOOLS !== "0" && (isDev ? allowDevTools : false);

  return { isDev, devServerUrl, allowDevTools, openDevTools };
}

function resolveIndexHtmlPath() {
  // In packaged app: __dirname is .../resources/app.asar/electron
  // dist is packaged by electron-builder "files": ["electron/**","dist/**",...]
  return path.join(__dirname, "..", "dist", "index.html");
}

function createWindow() {
  const { isDev, devServerUrl, allowDevTools, openDevTools } = getRuntimeFlags();

  // Provide simple flags to preload/renderer if you want them later
  process.env.TMD_ENV = isDev ? "development" : "production";
  process.env.TMD_DEVTOOLS_ALLOWED = allowDevTools ? "1" : "0";

  const preloadPath = path.join(__dirname, "preload.js");
  const indexHtmlPath = resolveIndexHtmlPath();

  console.log(
    `[TMD] boot isPackaged=${app.isPackaged} isDev=${isDev} allowDevTools=${allowDevTools} openDevTools=${openDevTools}`
  );
  console.log(`[TMD] preload=${preloadPath}`);
  console.log(`[TMD] indexHtml=${indexHtmlPath}`);
  if (isDev) console.log(`[TMD] devServerUrl=${devServerUrl || "(default http://localhost:5173)"}`);

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: allowDevTools
    }
  });

  // External links should open in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Deterministically block DevTools toggle shortcuts when disabled
  win.webContents.on("before-input-event", (event, input) => {
    const isToggle =
      input.type === "keyDown" &&
      (
        input.key === "F12" ||
        ((input.control || input.meta) && input.shift && (input.key === "I" || input.code === "KeyI"))
      );

    if (!allowDevTools && isToggle) event.preventDefault();
  });

  // Load dev server or built file
  if (isDev) {
    const urlToLoad = devServerUrl || "http://localhost:5173";
    console.log(`[TMD] loadURL ${urlToLoad}`);
    win.loadURL(urlToLoad);
  } else {
    console.log(`[TMD] loadFile ${indexHtmlPath}`);
    win.loadFile(indexHtmlPath);
  }

  // Logging so we never guess again
  win.webContents.on("did-finish-load", () => {
    console.log(`[TMD] did-finish-load url=${win.webContents.getURL()}`);
  });

  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame) {
      console.error(`[TMD] did-fail-load code=${code} desc=${desc} url=${url}`);
    }
  });

  win.webContents.on("render-process-gone", (_e, details) => {
    console.error(`[TMD] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });

  win.on("ready-to-show", () => {
    win.show();
    if (openDevTools) win.webContents.openDevTools({ mode: "detach" });
  });

  return win;
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










