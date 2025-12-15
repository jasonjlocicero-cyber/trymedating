// electron/main.js (CommonJS)
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
const START_URL =
  process.env.TMD_APP_URL ||
  `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;

function getMainWindow() {
  return BrowserWindow.getAllWindows()[0];
}

function sendDeepLinkToRenderer(payload) {
  const win = getMainWindow();
  if (win) {
    win.webContents.send('deep-link', payload);
    if (win.isMinimized()) win.restore();
    win.focus();
  }
}

function handleDeepLink(rawUrl) {
  try {
    const u = new URL(rawUrl);
    // Supported:
    // tryme://invite/TOKEN
    // tryme://chat/PEER_ID
    // tryme://profile/HANDLE
    const parts = u.pathname.split('/').filter(Boolean); // ['invite','TOKEN']
    const action = parts[0] || '';
    const id = parts[1] || '';

    if (action === 'invite' && id) {
      sendDeepLinkToRenderer({ type: 'invite', token: id });
    } else if (action === 'chat' && id) {
      sendDeepLinkToRenderer({ type: 'chat', peerId: id });
    } else if (action === 'profile' && id) {
      sendDeepLinkToRenderer({ type: 'profile', handle: id });
    } else {
      console.warn('Unknown deep link:', rawUrl);
    }
  } catch (e) {
    console.error('Invalid deep link:', rawUrl, e);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  Menu.setApplicationMenu(null);

  if (START_URL.startsWith('file://')) {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    win.loadURL(START_URL);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

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

// Single-instance (so deep links route to the existing window)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const link = argv.find((a) => typeof a === 'string' && a.startsWith('tryme://'));
    if (link) handleDeepLink(link);
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

app.whenReady().then(() => {
  // Register protocol handler
  if (process.defaultApp) {
    // dev: associate with current Electron
    app.setAsDefaultProtocolClient('tryme', process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient('tryme');
  }

  // macOS deep link event
  app.on('open-url', (e, url) => {
    e.preventDefault();
    handleDeepLink(url);
  });

  createWindow();

  // Handle a deep link if the app was launched with it (Windows)
  const firstLink = process.argv.find((a) => typeof a === 'string' && a.startsWith('tryme://'));
  if (firstLink) handleDeepLink(firstLink);

  app.on('activate', () => {
    if (!getMainWindow()) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
;
