// main.js — BlockBuilder desktop wrapper. Loads the same web UI used in the browser inside
// a native Electron window. Supports loading from dev server during development.
const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

// Set by scripts or npm commands to point at the live Vite dev server instead of the bundled
// production build, so UI changes hot-reload without repackaging the app each time.
const DEV_SERVER_URL = process.env.BLOCKBUILDER_DEV_SERVER_URL;

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: "BlockBuilder",
    backgroundColor: "#0f1419",
    icon: path.join(__dirname, "build/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (DEV_SERVER_URL) {
    // Development: load from Vite dev server
    mainWindow.loadURL(DEV_SERVER_URL);
    // Open DevTools in development by default
    if (process.env.BLOCKBUILDER_DEVTOOLS) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    // Production: load from bundled web-dist
    mainWindow.loadFile(path.join(__dirname, "web-dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  createMenu();
}

function createMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Exit",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.on("ready", createMainWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});
