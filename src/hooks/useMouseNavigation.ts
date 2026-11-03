import { useEffect } from "react";
import { browseStep, nextPhoto, prevPhoto, wake } from "@/state/actions";
import { useSessionStore } from "@/state/sessionStore";
import { useUiStore } from "@/state/uiStore";

export function useMouseNavigation() {
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      const ui = useUiStore.getState();
      if (ui.browsing || ui.historyView || ui.menuOpen) return;

      const forward = event.button === 4;
      if (useSessionStore.getState().snapshot.state !== "idle") {
        if (forward) nextPhoto();
        else prevPhoto();
      } else {
        browseStep(forward ? 1 : -1);
      }
      wake();
    };
    // Cancel browser history navigation without advancing the photo twice.
    const preventNavigation = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) event.preventDefault();
    };
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mouseup", preventNavigation, true);
    window.addEventListener("auxclick", preventNavigation, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mouseup", preventNavigation, true);
      window.removeEventListener("auxclick", preventNavigation, true);
    };
  }, []);
}
