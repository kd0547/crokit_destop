import { contextBridge, ipcRenderer, webUtils } from "electron";

const API_BASE = "http://127.0.0.1:58090";

contextBridge.exposeInMainWorld("crokit", {
  apiBase: API_BASE,

  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    close: () => ipcRenderer.invoke("window:close"),
    toggleFullscreen: () => ipcRenderer.invoke("window:toggleFullscreen"),
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke("window:setAlwaysOnTop", flag),
    setTitle: (title: string) => ipcRenderer.invoke("window:setTitle", title),
    notifyResizeMoveEnd: () => ipcRenderer.invoke("window:resizeMoveEnd"),
  },

  dialog: {
    selectFolder: (): Promise<string | null> => ipcRenderer.invoke("dialog:selectFolder"),
  },

  files: {
    // File.path was removed in Electron 32; webUtils is only reachable from the preload
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  },

  clipboard: {
    writeImage: (png: ArrayBuffer): Promise<void> => ipcRenderer.invoke("clipboard:writeImage", png),
  },

  session: {
    start: (playlist: unknown, config: unknown, startAt: number) => ipcRenderer.invoke("session:start", playlist, config, startAt),
    pause: () => ipcRenderer.invoke("session:pause"),
    resume: () => ipcRenderer.invoke("session:resume"),
    stop: () => ipcRenderer.invoke("session:stop"),
    next: () => ipcRenderer.invoke("session:next"),
    previous: () => ipcRenderer.invoke("session:previous"),
    getSnapshot: () => ipcRenderer.invoke("session:getSnapshot"),
    onUpdate: (callback: (snapshot: unknown) => void) => {
      const listener = (_event: unknown, snapshot: unknown) => callback(snapshot);
      ipcRenderer.on("session:update", listener);
      return () => ipcRenderer.removeListener("session:update", listener);
    },
  },

  history: {
    onUpdated: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("history:updated", listener);
      return () => ipcRenderer.removeListener("history:updated", listener);
    },
  },
});
