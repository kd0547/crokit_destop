import { useEffect } from "react";
import { useSessionStore } from "@/state/sessionStore";
import { useFolderStore } from "@/state/folderStore";
import { useUiStore } from "@/state/uiStore";
import { browseStep, gifStep, gifTogglePlay, nextPhoto, prevPhoto, startSession, stopSession, togglePanel, togglePause, wake } from "@/state/actions";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function currentIsGif(): boolean {
  const snapshot = useSessionStore.getState().snapshot;
  if (snapshot.state !== "idle") return !!snapshot.current?.isGif;
  const { files } = useFolderStore.getState();
  const { currentIndex } = useUiStore.getState();
  return !!files[currentIndex]?.is_gif;
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const snapshot = useSessionStore.getState().snapshot;
      const running = snapshot.state !== "idle";
      const ui = useUiStore.getState();
      const menuOpen = ui.menuOpen;

      if (e.key === "[") {
        togglePanel();
      } else if (e.code === "Space") {
        e.preventDefault();
        if (running) togglePause();
        else startSession();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const delta = e.key === "ArrowRight" ? 1 : -1;
        if (running) {
          e.preventDefault();
          if (delta > 0) nextPhoto();
          else prevPhoto();
        } else if (!ui.browsing && !ui.historyView) {
          // idle: step through the current folder (stage hidden behind the browser/history layer otherwise)
          e.preventDefault();
          browseStep(delta);
        }
      } else if (e.key === "," && currentIsGif()) {
        gifStep(-1);
      } else if (e.key === "." && currentIsGif()) {
        gifStep(1);
      } else if ((e.key === "k" || e.key === "K") && currentIsGif()) {
        gifTogglePlay();
      } else if (e.key === "Escape" && menuOpen) {
        useUiStore.getState().setMenuOpen(null);
      } else if (e.key === "Escape" && running) {
        stopSession();
      }
      wake();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
