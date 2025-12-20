// electron/main.js
import { app, BrowserWindow } from 'electron'
import path from 'path'

const DEVTOOLS = process.env.TMD_DEVTOOLS === '1'
const DEV_SERVER_URL = process.env.TMD_DEV_SERVER_URL // e.g. http://localhost:5173

let win

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  })

  if (DEV_SERVER_URL) {
    // DEV: load Vite
    win.loadURL(DEV_SERVER_URL)
  } else {
    // PROD: load built files (dist)
    const indexHtml = path.join(__dirname, '..', 'dist', 'index.html')
    win.loadFile(indexHtml, { hash: '/' })
  }

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url)
  })

  if (DEVTOOLS) {
    win.webContents.openDevTools({ mode: 'detach' })
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})







