// electron/main.js
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');
const url = require('url');

const isDev = !app.isPackaged;

// If the app is already running, focus the existing one.
const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function createMinimalAppMenu() {
  // No custom menus on Windows/Linux (null = no menu).
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  // On macOS, keep a tiny standard menu so copy/paste work naturally.
  const template = [
    {
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function isHttps(u) {
  try { return new URL(u).protocol === 'https:'; } catch { return false; }
}
function isMailOrTel(u) {
  try {
    const p = new URL(u).protocol;
    return p === 'mailto:' || p === 'tel:';
  } catch { return false; }
}

function getAppStartUrl() {
  if (isDev) return 'http://localhost:5173';
  // Production: load built index.html
  return url.format({
    pathname: path.join(__dirname, '..', 'dist', 'index.html'),
    protocol: 'file:',
    slashes: true
  });
}

function sameOrigin(a, b) {
  try {
    const A = new URL(a);
    const B = new URL(b);
    return A.protocol === B.protocol && A.host === B.host;
  } catch {
    return a.startsWith('file:') && b.startsWith('file:');
  }
}

function createWindow() {
  const startUrl = getAppStartUrl();

  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    backgroundColor: '#ffffff',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev
    }
  });

  // Only show after ready to avoid white flash
  win.once('ready-to-show', () => win.show());

  // Load app
  win.loadURL(startUrl);

  // Block in-app navigation to other origins.
  win.webContents.on('will-navigate', (e, targetUrl) => {
    if (!sameOrigin(targetUrl, startUrl)) {
      e.preventDefault();
    }
  });

  // Open new windows externally with a strict allowlist.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    // Allow only mailto/tel OR https links you explicitly trust.
    if (isMailOrTel(target)) {
      shell.openExternal(target);
      return { action: 'deny' };
    }
    // If you want to allow *some* external https links later, add hostnames here:
    // const ALLOW_HOSTS = new Set(['yourdomain.com', 'www.yourdomain.com']);
    // if (isHttps(target) && ALLOW_HOSTS.has(new URL(target).hostname)) { ... }

    // By default, deny popups; open nothing.
    return { action: 'deny' };
  });

  // No file downloads from the app
  win.webContents.session.on('will-download', (e) => e.preventDefault());

  // Keep DevTools out of production
  if (!isDev) win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());

  return win;
}

app.whenReady().then(() => {
  createMinimalAppMenu();

  // Deny all permission prompts by default (tightest setting).
  // If you later need 'notifications' or 'media', selectively allow it here.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => {
    callback(false);
  });

  // Disallow attaching <webview> tags entirely
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS keep app alive until Cmd+Q; elsewhere, quit.
  if (process.platform !== 'darwin') app.quit();
});

// Last-resort safety: don’t crash the app on unhandled errors.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
