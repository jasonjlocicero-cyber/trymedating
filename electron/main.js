// electron/main.js (or your main process file)
import { app, BrowserWindow } from "electron";
import path from "path";

const DEVTOOLS = process.env.TMD_DEVTOOLS === "1";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), // keep yours
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 🔥 HARD FORCE: always start at "#/" so HashRouter routes mount
  const indexHtml = path.join(__dirname, "..", "dist", "index.html");

  win.loadFile(indexHtml, { hash: "/" }); // <--- THIS is the key

  // Debug helpers (packaged-safe)
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[did-fail-load]", code, desc, url);
  });

  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[render-process-gone]", details);
  });

  if (DEVTOOLS) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(createWindow);




