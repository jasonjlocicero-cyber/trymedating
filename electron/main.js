// electron/main.js
import { app, BrowserWindow } from "electron";
import path from "path";

const DEVTOOLS = process.env.TMD_DEVTOOLS === "1" || !app.isPackaged;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL; // optional, if you use it in dev

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

  // ---- Load URL (dev) or file (prod) ----
  if (DEV_SERVER_URL) {
    // Dev: Vite server
    // Use hash routing in Electron
    mainWindow.loadURL(`${DEV_SERVER_URL}#/`);
  } else {
    // Prod: packaged/dist
    const indexHtml = path.join(__dirname, "..", "dist", "index.html");
    // HashRouter expects #/...
    mainWindow.loadFile(indexHtml, { hash: "/" });
  }

  // ---- Always log failures ----
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[did-fail-load]", code, desc, url);
  });

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[render-process-gone]", details);
  });

  // ---- DevTools toggle keys (works in packaged too) ----
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    const isF12 = input.key === "F12" && input.type === "keyDown";
    const isCtrlShiftI =
      input.type === "keyDown" &&
      input.control &&
      input.shift &&
      (input.key === "I" || input.key === "i");

    if (isF12 || isCtrlShiftI) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: "detach" });
      }
      _event.preventDefault();
    }
  });

  if (DEVTOOLS) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
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





