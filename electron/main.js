// electron/main.js
const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

const START_URL = process.env.TMD_APP_URL || 'https://trymedating.com/' // change to your live URL if different

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // keeps context isolated
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load your live site
  win.loadURL(START_URL)

  // Open external links in the user’s default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url)
      const isApp = u.origin === new URL(START_URL).origin
      if (!isApp) {
        shell.openExternal(url)
        return { action: 'deny' }
      }
    } catch (_) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
