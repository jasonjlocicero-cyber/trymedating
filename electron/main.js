// electron/main.js (CommonJS)
// Deterministic dev/prod behavior + safer window defaults + better diagnostics

'use strict'

const { app, BrowserWindow, shell, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const APP_NAME = 'TryMeDating'

// ---------- Runtime flags ----------
function getRuntimeFlags() {
  const isDev = !app.isPackaged

  const devServerUrl = process.env.TMD_DEV_SERVER_URL || ''
  const devToolsEnv = process.env.TMD_DEVTOOLS

  // DevTools deterministic:
  // dev: allow unless TMD_DEVTOOLS=0
  // prod(packaged): deny unless TMD_DEVTOOLS=1
  const allowDevTools = isDev ? devToolsEnv !== '0' : devToolsEnv === '1'

  // Auto-open:
  // dev: yes (if allowed) unless TMD_OPEN_DEVTOOLS=0
  // prod: no (even if allowed) unless you explicitly want it later
  const openDevTools =
    allowDevTools &&
    process.env.TMD_OPEN_DEVTOOLS !== '0' &&
    (isDev ? true : false)

  return { isDev, devServerUrl, allowDevTools, openDevTools }
}

// ---------- Hardening: separate userData for dev vs prod ----------
// This prevents stale cache / storage / SW remnants from causing “random” behavior.
function setUserDataPathEarly() {
  const isDev = !app.isPackaged
  if (!isDev) return

  // Put dev user data in a separate folder from packaged installs.
  // Example on Windows: %AppData%\TryMeDating-dev
  const base = path.join(app.getPath('appData'), APP_NAME)
  app.setPath('userData', `${base}-dev`)
}
setUserDataPathEarly()

// ---------- Single instance lock ----------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// ---------- Paths ----------
function resolveIndexHtmlPath() {
  // In packaged app.asar: __dirname -> .../resources/app.asar/electron
  // dist is included by electron-builder "files": ["electron/**","dist/**",...]
  return path.join(__dirname, '..', 'dist', 'index.html')
}

// ---------- Window ----------
function createWindow() {
  const { isDev, devServerUrl, allowDevTools, openDevTools } = getRuntimeFlags()

  process.env.TMD_ENV = isDev ? 'development' : 'production'
  process.env.TMD_DEVTOOLS_ALLOWED = allowDevTools ? '1' : '0'

  const preloadPath = path.join(__dirname, 'preload.js')
  const indexHtmlPath = resolveIndexHtmlPath()

  console.log(
    `[TMD] boot isPackaged=${app.isPackaged} isDev=${isDev} allowDevTools=${allowDevTools} openDevTools=${openDevTools}`
  )
  console.log(`[TMD] userData=${app.getPath('userData')}`)
  console.log(`[TMD] preload=${preloadPath}`)
  console.log(`[TMD] indexHtml=${indexHtmlPath}`)

  // Defensive: if prod build output is missing, fail loudly with a helpful page
  if (!isDev && !fs.existsSync(indexHtmlPath)) {
    const msg =
      `TryMeDating failed to start.\n\n` +
      `Missing: ${indexHtmlPath}\n\n` +
      `Fix: run "npm run build" before packaging, and ensure electron-builder includes dist/**.`
    console.error(`[TMD] ${msg}`)
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: allowDevTools
    }
  })

  // Hard security: deny all permission requests by default
  // (you can allow specific ones later if you truly need them)
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })

  // External links should open in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Prevent top-level navigation to random sites
  win.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url)

      // Allow in-app navigation for:
      // - file:// (packaged)
      // - the dev server origin (dev)
      const allow =
        target.protocol === 'file:' ||
        (isDev && devServerUrl && url.startsWith(devServerUrl))

      if (!allow) {
        event.preventDefault()
        shell.openExternal(url)
      }
    } catch {
      // If URL parsing fails, block it
      event.preventDefault()
    }
  })

  // Deterministically block DevTools toggle shortcuts when disabled
  win.webContents.on('before-input-event', (event, input) => {
    const isToggle =
      input.type === 'keyDown' &&
      (input.key === 'F12' ||
        ((input.control || input.meta) &&
          input.shift &&
          (input.key === 'I' || input.code === 'KeyI')))

    if (!allowDevTools && isToggle) event.preventDefault()
  })

  // Load dev server or built file
  if (isDev) {
    const urlToLoad = devServerUrl || 'http://localhost:5173'
    console.log(`[TMD] loadURL ${urlToLoad}`)
    win.loadURL(urlToLoad)
  } else {
    console.log(`[TMD] loadFile ${indexHtmlPath}`)
    // If dist is missing, show a visible error instead of a blank window
    if (!fs.existsSync(indexHtmlPath)) {
      const html = `
        <html><body style="font-family:system-ui;background:#0b0f14;color:#fff;padding:24px">
          <h2>TryMeDating failed to start</h2>
          <p><b>Missing:</b> ${indexHtmlPath}</p>
          <p>Rebuild with <code>npm run build</code> and repackage. Also confirm electron-builder includes <code>dist/**</code>.</p>
        </body></html>`
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    } else {
      win.loadFile(indexHtmlPath)
    }
  }

  // Diagnostics: never guess again
  win.webContents.on('did-finish-load', () => {
    console.log(`[TMD] did-finish-load url=${win.webContents.getURL()}`)
  })

  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame) console.error(`[TMD] did-fail-load code=${code} desc=${desc} url=${url}`)
  })

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[TMD] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
  })

  win.on('ready-to-show', () => {
    win.show()
    if (openDevTools) win.webContents.openDevTools({ mode: 'detach' })
  })

  return win
}

// ---------- App lifecycle ----------
app.whenReady().then(() => {
  if (gotLock) {
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    // If a second instance is launched, focus the existing window
    app.on('second-instance', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
