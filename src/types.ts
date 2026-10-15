export interface DurationPreset {
  seconds: number;
  isUser: boolean;
}

export interface CountPreset {
  count: number;
  isUser: boolean;
}

/** global key (works while another app is focused); vk = Windows virtual-key code */
export interface Hotkey {
  vk: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  label: string;
}

export interface Settings {
  window_width: number;
  window_height: number;
  window_x: number | null;
  window_y: number | null;
  panel_open: boolean;
  always_on_top: boolean;
  auto_hide: boolean;
  sound: boolean;
  gray: boolean;
  flip: boolean;
  grid: boolean;
  grid_color: string;
  grid_opacity: number;
  grid_divisions: number;
  order_mode: "random" | "seq";
  duration_seconds: number;
  duration_presets: DurationPreset[];
  count: number;
  count_presets: CountPreset[];
  observe_enabled: boolean;
  observe_seconds: number;
  observe_presets: DurationPreset[];
  breaks_enabled: boolean;
  break_every: number;
  break_seconds: number;
  /** legacy single-folder pick; only read once to seed folder_selection */
  current_folder_id: string | null;
  folder_selection: FolderSelectionItem[];
  flip_hotkey: Hotkey | null;
}

/** recursive = the folder and all its subfolders, otherwise only images directly inside it */
export interface FolderSelectionItem {
  folder_id: string;
  rel_path: string;
  recursive: boolean;
}

export interface FolderNode {
  rel_path: string; // relative to the registered folder, "" = the folder itself
  name: string;
  count: number; // images directly inside
  total: number; // including subfolders
  samples: string[]; // cover images (absolute paths)
  children: FolderNode[];
}

export interface FolderInfo {
  id: string;
  name: string;
  path: string;
  order_index: number;
  count: number;
  tree: FolderNode;
}

export interface FolderFile {
  path: string;
  name: string;
  is_gif: boolean;
  folder_id: string | null;
}

export interface PracticeImage {
  order_index: number;
  folder_id: string | null;
  rel_path: string;
  source_path: string;
  thumb_file: string;
  width: number;
  height: number;
}

export interface HistoryEntry {
  id: string;
  created_at: string;
  folder_id: string | null;
  folder_name: string;
  images_count: number;
  duration_seconds: number;
  minutes: number;
  images: PracticeImage[];
}

export type SessionState = "idle" | "observe" | "running" | "paused" | "break";

export interface PlaylistEntry {
  path: string;
  isGif: boolean;
}

export interface SessionConfig {
  isRandom: boolean;
  targetCount: number;
  durationSeconds: number;
  observeEnabled: boolean;
  observeSeconds: number;
  breaksEnabled: boolean;
  breakEvery: number;
  breakSeconds: number;
  folderId: string | null;
  folderName: string;
}

export interface SessionSnapshot {
  state: SessionState;
  current: PlaylistEntry | null;
  remainingMs: number;
  shownCount: number;
  completedCount: number;
  totalCount: number;
  startIndex: number;
  currentIndex: number;
  folderName: string;
  durationSeconds: number;
}

export interface CrokitBridge {
  apiBase: string;
  window: {
    minimize: () => Promise<void>;
    close: () => Promise<void>;
    toggleFullscreen: () => Promise<void>;
    setAlwaysOnTop: (flag: boolean) => Promise<void>;
    setTitle: (title: string) => Promise<void>;
    notifyResizeMoveEnd: () => Promise<void>;
  };
  dialog: {
    selectFolder: () => Promise<string | null>;
  };
  files: {
    /** absolute path of a file/folder dropped onto the window */
    getPathForFile: (file: File) => string;
  };
  clipboard: {
    writeImage: (png: ArrayBuffer) => Promise<void>;
  };
  session: {
    start: (playlist: PlaylistEntry[], config: SessionConfig, startAt: number) => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    stop: () => Promise<void>;
    next: () => Promise<void>;
    previous: () => Promise<void>;
    getSnapshot: () => Promise<SessionSnapshot>;
    onUpdate: (callback: (snapshot: SessionSnapshot) => void) => () => void;
  };
  history: {
    onUpdated: (callback: () => void) => () => void;
  };
}

declare global {
  interface Window {
    crokit: CrokitBridge;
  }
}
