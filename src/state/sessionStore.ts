import { create } from "zustand";
import type { SessionSnapshot } from "@/types";
import { useUiStore } from "./uiStore";

interface SessionStoreState {
  snapshot: SessionSnapshot;
  subscribe: () => () => void;
}

const idleSnapshot: SessionSnapshot = {
  state: "idle",
  current: null,
  remainingMs: 0,
  shownCount: 0,
  completedCount: 0,
  totalCount: 0,
  startIndex: 0,
  currentIndex: 0,
  folderName: "",
  durationSeconds: 60,
};

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  snapshot: idleSnapshot,
  subscribe: () => {
    window.crokit.session.getSnapshot().then((snapshot) => set({ snapshot }));
    return window.crokit.session.onUpdate((snapshot) => {
      const prev = get().snapshot;
      if (prev.state !== "idle" && snapshot.state === "idle") {
        useUiStore.getState().setDone({
          // the idle snapshot still carries the finished session's count (incl. a last image completed on the final tick)
          n: snapshot.completedCount,
          mins: Math.round((snapshot.completedCount * prev.durationSeconds) / 60),
        });
      }
      set({ snapshot });
    });
  },
}));
