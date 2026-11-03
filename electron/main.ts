import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiHeaders, getApiBase, getApiToken, startPythonBackend, stopPythonBackend } from "./pythonBridge";
import { createMainWindow, setWindowAlwaysOnTop } from "./windowManager";
import { mainT } from "./i18n";
import { SessionManager, type PlaylistEntry, type SessionConfig } from "./session";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");

const preloadPath = path.join(__dirname, "preload.mjs");

let mainWindow: BrowserWindow | null = null;
const session = new SessionManager();

interface Settings {
  window_width: number;
  window_height: number;
  window_x: number | null;
  window_y: number | null;
  always_on_top?: boolean;
}

async function fetchSettings(): Promise<Settings> {
  const res = await fetch(`${getApiBase()}/settings`, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`GET /settings failed: ${res.status}`);
  return res.json();
}

async function patchSettings(fields: Record<string, unknown>): Promise<void> {
  await fetch(`${getApiBase()}/settings`, {
    method: "PUT",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(fields),
  }).catch((err) => console.error("Failed to save settings", err));
}

function broadcastSessionUpdate() {
  mainWindow?.webContents.send("session:update", session.getSnapshot());
}

function registerIpcHandlers() {
  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle("window:toggleFullscreen", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.setFullScreen(!win.isFullScreen());
  });
  ipcMain.handle("window:setAlwaysOnTop", (event, flag: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) setWindowAlwaysOnTop(win, flag);
  });
  ipcMain.handle("window:setTitle", (event, title: string) => {
    BrowserWindow.fromWebContents(event.sender)?.setTitle(title);
  });
  ipcMain.handle("window:resizeMoveEnd", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== mainWindow) return;
    const bounds = win.getBounds();
    await patchSettings({
      window_width: bounds.width,
      window_height: bounds.height,
      window_x: bounds.x,
      window_y: bounds.y,
    });
  });

  // renderer decodes the image and sends PNG bytes (see src/lib/clipboard.ts)
  // (Electron 44 removed clipboard.writeImage; write() takes W3C-style ClipboardItems)
  ipcMain.handle("clipboard:writeImage", async (_event, png: ArrayBuffer | Uint8Array) => {
    const bytes = Buffer.from(png as ArrayBuffer);
    if (nativeImage.createFromBuffer(bytes).isEmpty()) throw new Error("invalid image data");
    await clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
  });

  // Since Electron 43 the dialog opens in Downloads unless told otherwise, so
  // start from the last folder picked (or Pictures, where references usually live)
  let lastFolderDialogPath: string | undefined;
  ipcMain.handle("dialog:selectFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      defaultPath: lastFolderDialogPath ?? app.getPath("pictures"),
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    lastFolderDialogPath = result.filePaths[0];
    return result.filePaths[0];
  });

  ipcMain.handle("session:start", (_event, playlist: PlaylistEntry[], config: SessionConfig, startAt: number) => {
    session.start(playlist, config, startAt);
  });
  ipcMain.handle("session:pause", () => session.pause());
  ipcMain.handle("session:resume", () => session.resume());
  ipcMain.handle("session:stop", () => session.stop());
  ipcMain.handle("session:next", () => session.next());
  ipcMain.handle("session:previous", () => session.previous());
  ipcMain.handle("session:getSnapshot", () => session.getSnapshot());

  session.on("update", broadcastSessionUpdate);
  session.on("finished", (result) => {
    if (!result || result.imagesDrawn <= 0) return;
    fetch(`${getApiBase()}/history`, {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        folder_id: result.folderId,
        folder_name: result.folderName,
        images_count: result.imagesDrawn,
        duration_seconds: result.durationSeconds,
        minutes: result.minutes,
        images: result.images,
      }),
    })
      .then(() => mainWindow?.webContents.send("history:updated"))
      .catch((err) => console.error("Failed to record session history", err));
  });
}

async function onReady() {
  const dataDir = app.getPath("userData");

  try {
    await startPythonBackend(process.env.APP_ROOT!, dataDir);
  } catch (err) {
    console.error(err);
    dialog.showErrorBox(
      mainT("backendFailedTitle"),
      mainT(app.isPackaged ? "backendFailedPackaged" : "backendFailedDev") + "\n\n" + String(err)
    );
  }

  const settings = await fetchSettings().catch(() => ({
    window_width: 1180,
    window_height: 760,
    window_x: null,
    window_y: null,
    always_on_top: false,
  }));

  registerIpcHandlers();

  mainWindow = createMainWindow(preloadPath, {
    width: settings.window_width,
    height: settings.window_height,
    x: settings.window_x,
    y: settings.window_y,
    alwaysOnTop: settings.always_on_top,
    apiBase: getApiBase(),
    apiToken: getApiToken(),
  });

  let resizeMoveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleBoundsSave = () => {
    if (resizeMoveTimer) clearTimeout(resizeMoveTimer);
    resizeMoveTimer = setTimeout(() => {
      if (!mainWindow) return;
      const bounds = mainWindow.getBounds();
      patchSettings({
        window_width: bounds.width,
        window_height: bounds.height,
        window_x: bounds.x,
        window_y: bounds.y,
      });
    }, 400);
  };
  mainWindow.on("resize", scheduleBoundsSave);
  mainWindow.on("move", scheduleBoundsSave);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Only one crokit at a time: a second launch just brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(onReady);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopPythonBackend();
});
