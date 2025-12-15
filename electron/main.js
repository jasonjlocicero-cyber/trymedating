// electron/main.js
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

let win;

/**
 * URL strategy:
 * - If you set TMD_APP_URL, we always load that (best for “wrapper” builds).
 * - Else if running dev (ELECTRON_START_URL/VITE_DEV_SERVER_URL), load that.
 * - Else default to your live site.
 */
const APP_URL =
  process.env.TMD_APP_URL ||
  process.env.ELECTRON_START_URL ||
  process.env.VITE_DEV_SERVER_URL ||
  'https://trymedating.com';

const PROTOCOL = 'tryme';

function registerProtocol() {
  try {
    // Best-effort registration (Windows/macOS)
    // NOTE: On Windows, protocol registration is most reliable from an installed build,
    // but this still helps in dev + “first run” scenarios.
    if (process.defaultApp) {
      // Dev mode: pass the entry script as an arg (Windows needs this)
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      // Packaged app
      app.setAsDefaultProtocolClient(PROTOCOL);
    }
  } catch (e) {
    console.error('[protocol] register failed:', e);
  }
}

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

  // Load dev server or your live site (wrapper) or whatever TMD_APP_URL points to
  win.loadURL(APP_URL);

  // Open external links in the user’s default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function navigateToRoute(target) {
  if (!win) return;

  const js = `
    try {
      window.history.pushState({}, "", ${JSON.stringify(target)});
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (e) {}
  `;

  win.show();
  win.focus();
  win.webContents.executeJavaScript(js).catch(() => {});
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

    // If the page hasn’t finished loading yet, wait a moment.
    if (win && win.webContents && win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => navigateToRoute(target));
    } else {
      navigateToRoute(target);
    }
  } catch (e) {
    console.error('[deep link] error:', e);
  }
}

// Ensure single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Windows: handle deep link when a 2nd instance is attempted
  app.on('second-instance', (_event, argv) => {
    const deep = argv.find(a => typeof a === 'string' && a.startsWith(`${PROTOCOL}://`));
    if (deep) handleDeepLink(deep);

    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    registerProtocol();
    createWindow();

    // Windows: handle a deep link passed at first launch
    if (process.platform === 'win32') {
      const deepArg = process.argv.find(a => typeof a === 'string' && a.startsWith(`${PROTOCOL}://`));
      if (deepArg) setTimeout(() => handleDeepLink(deepArg), 500);
    }
  });

  // macOS: deep links (app already running / or launching)
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
