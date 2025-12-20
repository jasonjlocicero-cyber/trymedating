// electron/main.js
import { app, BrowserWindow } from 'electron'
import path from 'path'

const DEVTOOLS = process.env.TMD_DEVTOOLS === '1'
const DEV_SERVER_URL = process.env.TMD_DEV_SERVER_URL || ''

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

  // Dev mode: load Vite server
  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL)
  } else {
    // Prod mode: load built file and force hash route so HashRouter mounts
    const indexHtml = path.join(__dirname, '..', 'dist', 'index.html')
    win.loadFile(indexHtml, { hash: '/' })
  }

  // Useful diagnostics
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url)
  })

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details)
  })

  if (DEVTOOLS) {
    win.webContents.openDevTools({ mode: 'detach' })
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})








