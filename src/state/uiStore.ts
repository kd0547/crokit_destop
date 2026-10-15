import { create } from "zustand";

export type Section = "session" | "history";

/** folder shown in the library layer; null = the list of registered folders */
export interface LibraryPath {
  folderId: string;
  relPath: string;
}

/** history session shown in the stage layer; index null = image list, number = that image */
export interface HistoryView {
  entryId: string;
  index: number | null;
}

interface UiStoreState {
  menuOpen: string | null;
  section: Section;
  uiAwake: boolean;
  /** library layer (folder picker) open over the stage */
  browsing: boolean;
  libraryPath: LibraryPath | null;
  historyView: HistoryView | null;
  notice: string | null;

  currentIndex: number;
  startIndex: number;
  done: { n: number; mins: number } | null;

  editorOpen: boolean;
  customH: number;
  customM: number;
  customS: number;
  countEditorOpen: boolean;
  customCount: number;
  observeEditorOpen: boolean;
  customObserve: number;

  gifFrames: string[];
  gifFrame: number;
  gifPlaying: boolean;
  gifSpeed: number;
  gifA: number;
  gifB: number;
  gifFrozen: boolean;

  setMenuOpen: (k: string | null) => void;
  setSection: (s: Section) => void;
  setUiAwake: (v: boolean) => void;
  setBrowsing: (v: boolean) => void;
  setLibraryPath: (p: LibraryPath | null) => void;
  setHistoryView: (v: HistoryView | null) => void;
  showNotice: (msg: string) => void;
  setCurrentIndex: (i: number, resetStart?: boolean) => void;
  setDone: (d: { n: number; mins: number } | null) => void;
  setEditorOpen: (v: boolean) => void;
  setCustomTime: (h: number, m: number, s: number) => void;
  setCountEditorOpen: (v: boolean) => void;
  setCustomCount: (c: number) => void;
  setObserveEditorOpen: (v: boolean) => void;
  setCustomObserve: (s: number) => void;
  setGifFrames: (frames: string[]) => void;
  resetGif: () => void;
  setGifFrame: (i: number) => void;
  setGifPlaying: (v: boolean) => void;
  setGifSpeed: (v: number) => void;
  setGifRange: (a: number, b: number) => void;
  setGifFrozen: (v: boolean) => void;
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null;

export const useUiStore = create<UiStoreState>((set) => ({
  menuOpen: null,
  section: "session",
  uiAwake: true,
  browsing: false,
  libraryPath: null,
  historyView: null,
  notice: null,

  currentIndex: 0,
  startIndex: 0,
  done: null,

  editorOpen: false,
  customH: 0,
  customM: 3,
  customS: 0,
  countEditorOpen: false,
  customCount: 15,
  observeEditorOpen: false,
  customObserve: 20,

  gifFrames: [],
  gifFrame: 0,
  gifPlaying: true,
  gifSpeed: 1,
  gifA: 0,
  gifB: 0,
  gifFrozen: false,

  setMenuOpen: (k) => set({ menuOpen: k }),
  setSection: (s) => set((st) => ({ section: s, historyView: s === "history" ? st.historyView : null })),
  setUiAwake: (v) => set({ uiAwake: v }),
  setBrowsing: (v) => set({ browsing: v, historyView: null }),
  setLibraryPath: (p) => set({ libraryPath: p }),
  setHistoryView: (v) => set(v ? { historyView: v, browsing: false } : { historyView: null }),
  showNotice: (msg) => {
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => set({ notice: null }), 2400);
    set({ notice: msg });
  },
  setCurrentIndex: (i, resetStart) => set((s) => ({ currentIndex: i, startIndex: resetStart ? i : s.startIndex, done: null })),
  setDone: (d) => set({ done: d }),
  setEditorOpen: (v) => set({ editorOpen: v }),
  setCustomTime: (h, m, s) => set({ customH: h, customM: m, customS: s }),
  setCountEditorOpen: (v) => set({ countEditorOpen: v }),
  setCustomCount: (c) => set({ customCount: c }),
  setObserveEditorOpen: (v) => set({ observeEditorOpen: v }),
  setCustomObserve: (s) => set({ customObserve: s }),
  setGifFrames: (frames) => set({ gifFrames: frames }),
  resetGif: () => set((s) => ({ gifFrame: 0, gifA: 0, gifB: Math.max(0, s.gifFrames.length - 1), gifFrozen: false, gifPlaying: true })),
  setGifFrame: (i) => set({ gifFrame: i }),
  setGifPlaying: (v) => set({ gifPlaying: v }),
  setGifSpeed: (v) => set({ gifSpeed: v }),
  setGifRange: (a, b) => set({ gifA: a, gifB: b }),
  setGifFrozen: (v) => set({ gifFrozen: v }),
}));
