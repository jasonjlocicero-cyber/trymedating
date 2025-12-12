// src/desktop/main.js
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
let mainWindow;

// Make single-instance (prevents multiple app windows)
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    show: false, // show when ready-to-show for cleaner UX
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    }
  });

  // Where to load the app from:
  // 1) honor TMD_APP_URL if provided (your dev flow)
  // 2) dev fallback: http://localhost:5173
  // 3) prod: load built Vite files from /dist/index.html
  const startTarget =
    process.env.TMD_APP_URL ||
    (isDev ? 'http://localhost:5173' : path.join(__dirname, '../../dist/index.html'));

  if (/^https?:\/\//i.test(startTarget)) {
    mainWindow.loadURL(startTarget);
  } else {
    mainWindow.loadFile(startTarget);
  }

  mainWindow.on('ready-to-show', () => mainWindow.show());

  // Disallow new windows; open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('https://trymedating.com')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Catch in-app navigations to external domains and open externally
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const ok =
      url.startsWith('file://') ||
      url.startsWith('http://localhost') ||
      url.startsWith('https://trymedating.com');
    if (!ok) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
