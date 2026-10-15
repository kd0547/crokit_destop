import { useEffect } from "react";
import { toggleSetting } from "@/state/actions";

// while the user is recording a new key in the settings menu, the old key must not flip
let capturing = false;
export function setHotkeyCapturing(v: boolean): void {
  capturing = v;
}

/**
 * Listens to the backend's global keyboard hook (python/app/hotkey.py), so the
 * flip hotkey works even while another app (e.g. Photoshop) has focus.
 */
export function useFlipHotkey() {
  useEffect(() => {
    const url = window.crokit.apiBase.replace(/^http/, "ws") + "/hotkey/ws";
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      ws = new WebSocket(url);
      ws.onmessage = (e) => {
        if (e.data === "flip" && !capturing) toggleSetting("flip");
      };
      ws.onclose = () => {
        if (!disposed) retryTimer = setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);
}
