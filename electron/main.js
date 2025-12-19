// electron/main.js
import { app, BrowserWindow, dialog } from "electron";
import path from "path";

const DEVTOOLS = true; // FORCE ON for now
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL; // optional

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

  // ✅ PROOF POPUP: if you don't see this, you're NOT running this file
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "TryMeDating Debug",
    message: "MAIN.JS LOADED ✅ (electron/main.js)",
  });

  // ---- Load URL (dev) or file (prod) ----
  if (DEV_SERVER_URL) {
    mainWindow.loadURL(`${DEV_SERVER_URL}#/`);
  } else {
    const indexHtml = path.join(__dirname, "..", "dist", "index.html");
    // IMPORTANT: do NOT force hash here while we're debugging
    mainWindow.loadFile(indexHtml);
  }

  mainWindow.webContents.on("did-finish-load", async () => {
    const url = mainWindow.webContents.getURL();

    // ✅ Second proof popup: shows EXACTLY what Electron loaded
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "TryMeDating Debug",
      message: `did-finish-load ✅\nURL:\n${url}`,
    });

    // ✅ FORCE DevTools to open AFTER load
    setTimeout(() => {
      try {
        mainWindow.webContents.openDevTools({ mode: "detach" });
      } catch {}
    }, 250);
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "TryMeDating Debug",
      message: `[did-fail-load]\n${code} ${desc}\n${url}`,
    });
  });

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "TryMeDating Debug",
      message: `[render-process-gone]\n${JSON.stringify(details, null, 2)}`,
    });
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});






