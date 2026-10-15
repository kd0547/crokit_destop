import { BrowserWindow } from "electron";
import path from "node:path";

const isDev = !!process.env.VITE_DEV_SERVER_URL;

/**
 * On Windows the default level ("floating") makes Electron re-insert the window
 * right behind the taskbar on every focus. When the taskbar has been demoted
 * (e.g. a fullscreen app is active) that drags the window out of the topmost
 * band, so normal apps like Photoshop end up covering it. "screen-saver" skips
 * that and behaves like a plain HWND_TOPMOST.
 */
export function setWindowAlwaysOnTop(win: BrowserWindow, flag: boolean): void {
  win.setAlwaysOnTop(flag, "screen-saver");
}

export interface MainWindowOptions {
  width: number;
  height: number;
  x?: number | null;
  y?: number | null;
  alwaysOnTop?: boolean;
}

export function createMainWindow(preload: string, opts: MainWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: opts.width,
    height: opts.height,
    x: opts.x ?? undefined,
    y: opts.y ?? undefined,
    minWidth: 760,
    minHeight: 480,
    frame: false,
    // dev only: the packaged exe already carries logo.ico (package.json build.win.icon)
    icon: isDev ? path.join(process.env.APP_ROOT ?? "", "logo.ico") : undefined,
    backgroundColor: "#07080c",
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // not via the constructor option: that one always uses the "floating" level
  if (opts.alwaysOnTop) setWindowAlwaysOnTop(win, true);

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    win.loadFile(path.join(process.env.APP_ROOT ?? "", "dist", "index.html"));
  }

  return win;
}
