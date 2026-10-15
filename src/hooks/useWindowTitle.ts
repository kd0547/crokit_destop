import { useEffect } from "react";
import { useSessionStore } from "@/state/sessionStore";

export function useWindowTitle() {
  const snapshot = useSessionStore((s) => s.snapshot);

  useEffect(() => {
    const title =
      snapshot.state !== "idle"
        ? `${snapshot.folderName} — ${snapshot.shownCount}${snapshot.totalCount ? " / " + snapshot.totalCount : ""} — 크로키`
        : "크로키";
    window.crokit.window.setTitle(title);
  }, [snapshot.state, snapshot.folderName, snapshot.shownCount, snapshot.totalCount]);
}
