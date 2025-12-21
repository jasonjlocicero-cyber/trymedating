// electron/main.js (CommonJS)
// Fix: packaged EXE crash "Cannot use import statement outside a module"

const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

function getRuntimeFlags() {
  const isDev = !app.isPackaged;

  const devServerUrl = process.env.TMD_DEV_SERVER_URL || "";
  const devToolsEnv = process.env.TMD_DEVTOOLS;

  // DevTools deterministic:
  // dev: allow unless TMD_DEVTOOLS=0
  // prod: deny unless TMD_DEVTOOLS=1
  const allowDevTools = isDev ? devToolsEnv !== "0" : devToolsEnv === "1";

  // Auto-open:
  // dev: yes (if allowed)
  // prod: no
  const openDevTools =
    process.env.TMD_OPEN_DEVTOOLS !== "0" && (isDev ? allowDevTools : false);

  return { isDev, devServerUrl, allowDevTools, openDevTools };
}

function resolveIndexHtmlPath() {
  // __dirname will be .../resources/app.asar/electron when packaged
  return path.join(__dirname, "..", "dist", "index.html");
}

function createWindow() {
  const { isDev, devServerUrl, allowDevTools, openDevTools } = getRuntimeFlags();

  process.env.TMD_ENV = isDev ? "development" : "production";
  process.env.TMD_DEVTOOLS_ALLOWED = allowDevTools ? "1" : "0";

  const preloadPath = path.join(__dirname, "preload.js");
  const indexHtmlPath = resolveIndexHtmlPath();

  console.log(
    `[TMD] boot isPackaged=${app.isPackaged} isDev=${isDev} allowDevTools=${allowDevTools} openDevTools=${openDevTools}`
  );
  console.log(`[TMD] preload=${preloadPath}`);
  console.log(`[TMD] indexHtml=${indexHtmlPath}`);

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

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("before-input-event", (event, input) => {
    const isToggle =
      input.type === "keyDown" &&
      (
        input.key === "F12" ||
        ((input.control || input.meta) && input.shift && (input.key === "I" || input.code === "KeyI"))
      );

    if (!allowDevTools && isToggle) event.preventDefault();
  });

  if (isDev) {
    const urlToLoad = devServerUrl || "http://localhost:5173";
    console.log(`[TMD] loadURL ${urlToLoad}`);
    win.loadURL(urlToLoad);
  } else {
    console.log(`[TMD] loadFile ${indexHtmlPath}`);
    win.loadFile(indexHtmlPath);
  }

  win.webContents.on("did-finish-load", () => {
    console.log(`[TMD] did-finish-load url=${win.webContents.getURL()}`);
  });

  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame) console.error(`[TMD] did-fail-load code=${code} desc=${desc} url=${url}`);
  });

  win.webContents.on("render-process-gone", (_e, details) => {
    console.error(`[TMD] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });

  win.on("ready-to-show", () => {
    win.show();
    if (openDevTools) win.webContents.openDevTools({ mode: "detach" });
  });
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
;










