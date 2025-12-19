// electron/main.js
import { app, BrowserWindow } from "electron";
import path from "path";

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true, // ✅ explicitly allow
    },
  });

  const indexHtml = path.join(__dirname, "..", "dist", "index.html");

  // Load local build
  win.loadFile(indexHtml, { hash: "/" });

  // ✅ Always open devtools while we stabilize (we can disable later)
  win.webContents.openDevTools({ mode: "detach" });

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[did-fail-load]", code, desc, url);
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});






