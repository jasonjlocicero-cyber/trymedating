// electron/main.js (CommonJS)
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
const START_URL =
  process.env.TMD_APP_URL || // dev: e.g. http://localhost:5173
  `file://${path.join(__dirname, '..', 'dist', 'index.html')}`; // prod: local build

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon.ico'), // Windows .ico
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  // No app menu (keeps things clean)
  Menu.setApplicationMenu(null);

  // Load app
  if (START_URL.startsWith('file://')) {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    win.loadURL(START_URL);
  }

  // Open all new windows in the OS browser (and block popups)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Block navigation away from our app; open externals in OS browser
  win.webContents.on('will-navigate', (e, url) => {
    const isAppUrl =
      url.startsWith('file://') ||
      (process.env.TMD_APP_URL && url.startsWith(process.env.TMD_APP_URL));
    if (!isAppUrl) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.setAppUserModelId('com.trymedating.desktop');

app.whenReady().then(() => {
  // security: disallow <webview>
  app.on('web-contents-created', (_evt, contents) => {
    contents.on('will-attach-webview', (e) => e.preventDefault());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Single-instance lock (avoid duplicate windows)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
