// electron/main.js
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

let win;
const isDev = process.env.ELECTRON_START_URL || process.env.VITE_DEV_SERVER_URL;
const APP_URL = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, 'index.html')}`;

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true
      // (no nodeIntegration in renderer for safety)
    }
  });

  win.once('ready-to-show', () => win.show());

  // Load dev server or built index
  win.loadURL(APP_URL);

  // Open external links in the user’s default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Ensure single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // Windows: protocol link will be in argv
    const deep = argv.find(a => typeof a === 'string' && a.startsWith('tryme://'));
    if (deep) handleDeepLink(deep);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // Register protocol (works best once packaged;
    // in dev on Windows, this tries a best-effort registration)
    if (process.defaultApp) {
      app.setAsDefaultProtocolClient('tryme', process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient('tryme');
    }

    createWindow();

    // Handle a deep link passed at first launch (Windows)
    if (process.platform === 'win32') {
      const deepArg = process.argv.find(a => typeof a === 'string' && a.startsWith('tryme://'));
      if (deepArg) setTimeout(() => handleDeepLink(deepArg), 500);
    }
  });

  // macOS deep links (app already running)
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.on('window-all-closed', () => {
    // Keep default macOS behavior; quit on others
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function handleDeepLink(link) {
  try {
    const u = new URL(link);
    // Map tryme://… to SPA routes
    // Supported:
    //   tryme://connect?token=...
    //   tryme://u?handle=jason    (or tryme://u/jason)
    let target = '/';
    if (u.hostname === 'connect' || u.pathname === '/connect') {
      target = '/connect' + (u.search || '');
    } else if (u.hostname === 'u' || u.pathname.startsWith('/u/')) {
      const handle = u.searchParams.get('handle') || u.pathname.split('/').pop();
      if (handle) target = `/u/${handle}`;
    }

    if (win) {
      win.show();
      win.focus();
      // Navigate inside the SPA (React Router)
      const js = `
        window.history.pushState({}, "", "${target}");
        window.dispatchEvent(new PopStateEvent("popstate"));
      `;
      win.webContents.executeJavaScript(js).catch(() => {});
    }
  } catch (e) {
    console.error('deep link error:', e);
  }
}
