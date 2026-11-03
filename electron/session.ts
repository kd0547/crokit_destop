import { EventEmitter } from "node:events";

// per image: observe (optional) -> running (drawing) -> break (optional, every N images)
export type SessionState = "idle" | "observe" | "running" | "paused" | "break";

export interface PlaylistEntry {
  path: string;
  isGif: boolean;
  /** a saved sequence: its photos, played like a GIF as one item (path = first frame) */
  frames?: string[];
}

export interface SessionConfig {
  isRandom: boolean;
  targetCount: number; // 0 = run the whole playlist once
  durationSeconds: number;
  observeEnabled: boolean;
  observeSeconds: number; // look-only time shown before drawing starts on each image
  breaksEnabled: boolean;
  breakEvery: number; // take a break after every N images
  breakSeconds: number;
  folderId: string | null;
  folderName: string;
}

export interface SessionSnapshot {
  state: SessionState;
  current: PlaylistEntry | null;
  remainingMs: number;
  shownCount: number;
  completedCount: number; // images drawn for the full duration; kept after the session ends
  totalCount: number;
  startIndex: number;
  currentIndex: number;
  folderName: string;
  durationSeconds: number;
  phaseTotalMs: number; // full length of the current phase incl. extensions (progress-bar denominator)
}

export interface SessionFinishResult {
  imagesDrawn: number; // only images whose drawing timer ran out (skipped/stopped ones don't count)
  durationSeconds: number;
  minutes: number; // actual drawing time of the drawn images (extensions included)
  folderId: string | null;
  folderName: string;
  images: string[]; // paths of the drawn images, in completion order
}

const TICK_MS = 200;
const MAX_EXTEND_MS = 60 * 60 * 1000; // one call may add at most an hour

/**
 * Practice-session state machine, running in the Electron main process so
 * every window (just the one now -- there is no separate floating timer
 * window in this design) reads the same authoritative state over IPC.
 */
export class SessionManager extends EventEmitter {
  private playlist: PlaylistEntry[] = [];
  private currentIndex = 0;
  private startIndex = 0;
  private totalCount = 0;
  private state: SessionState = "idle";
  private deadline = 0;
  private pausedRemainingMs: number | null = null;
  private pausedFromState: SessionState = "running";
  private config: SessionConfig | null = null;
  private completed: number[] = []; // playlist indices whose drawing phase ran to the end
  private drawnMs = 0; // drawing time of the completed images, summed
  private phaseLengthMs = 0; // full length of the current phase (base + extensions, restarted by resetTimer)
  private carriedDrawMs = 0; // drawing time spent on the current image before the last resetTimer()
  private timer: ReturnType<typeof setInterval> | null = null;

  start(playlist: PlaylistEntry[], config: SessionConfig, startAt = 0): void {
    this.stopInternal();
    if (playlist.length === 0) return;

    this.playlist = config.isRandom ? shuffle(playlist) : playlist;
    this.config = config;
    this.completed = [];
    this.drawnMs = 0;
    this.currentIndex = Math.min(startAt, this.playlist.length - 1);
    this.startIndex = this.currentIndex;
    this.totalCount = config.targetCount > 0 ? Math.min(config.targetCount, this.playlist.length - this.startIndex) : this.playlist.length - this.startIndex;
    this.beginImage();

    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.emitUpdate();
  }

  pause(): void {
    if (this.state !== "observe" && this.state !== "running" && this.state !== "break") return;
    this.pausedRemainingMs = this.deadline - Date.now();
    this.pausedFromState = this.state;
    this.state = "paused";
    this.emitUpdate();
  }

  resume(): void {
    if (this.state !== "paused" || this.pausedRemainingMs === null) return;
    this.state = this.pausedFromState;
    this.deadline = Date.now() + this.pausedRemainingMs;
    this.pausedRemainingMs = null;
    this.emitUpdate();
  }

  stop(): SessionFinishResult | null {
    const result = this.buildFinishResult();
    this.stopInternal();
    if (result) this.emit("finished", result);
    this.emitUpdate();
    return result;
  }

  /**
   * Add time to whatever clock is showing: observe, drawing or break (also while
   * paused). Extending the drawing phase also counts toward the history minutes.
   */
  extend(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0 || !this.hasTimer()) return;
    const add = Math.min(ms, MAX_EXTEND_MS);
    this.setRemaining(this.currentRemaining() + add);
    this.phaseLengthMs += add;
    this.emitUpdate();
  }

  /** Restart the showing clock from its configured length (drawing: durationSeconds). */
  resetTimer(): void {
    if (!this.hasTimer()) return;
    const cfg = this.config!;
    const phase = this.activePhase();
    // time already drawn still happened -- keep it for the history minutes
    if (phase === "running") this.carriedDrawMs += Math.max(0, this.phaseLengthMs - this.currentRemaining());
    const full = (phase === "observe" ? cfg.observeSeconds : phase === "break" ? cfg.breakSeconds : cfg.durationSeconds) * 1000;
    this.setRemaining(full);
    this.phaseLengthMs = full;
    this.emitUpdate();
  }

  next(): void {
    if (this.state === "idle" || this.playlist.length === 0) return;
    const shown = this.currentIndex - this.startIndex + 1;
    if (shown >= this.totalCount || this.currentIndex + 1 >= this.playlist.length) {
      this.stop();
      return;
    }
    this.currentIndex += 1;
    this.beginImage();
    this.emitUpdate();
  }

  previous(): void {
    if (this.state === "idle" || this.playlist.length === 0) return;
    this.currentIndex = Math.max(this.currentIndex - 1, this.startIndex);
    this.beginImage();
    this.emitUpdate();
  }

  getSnapshot(): SessionSnapshot {
    const remainingMs = this.state === "idle" ? 0 : Math.max(0, this.pausedRemainingMs ?? this.deadline - Date.now());
    return {
      state: this.state,
      current: this.playlist[this.currentIndex] ?? null,
      remainingMs,
      shownCount: this.state === "idle" ? 0 : this.currentIndex - this.startIndex + 1,
      completedCount: this.completed.length,
      totalCount: this.totalCount,
      startIndex: this.startIndex,
      currentIndex: this.currentIndex,
      folderName: this.config?.folderName ?? "",
      durationSeconds: this.config?.durationSeconds ?? 60,
      phaseTotalMs: this.state === "idle" ? 0 : this.phaseLengthMs,
    };
  }

  private hasTimer(): boolean {
    return this.config !== null && (this.state === "observe" || this.state === "running" || this.state === "break" || this.state === "paused");
  }

  /** The phase whose clock is showing; for "paused", the phase it was paused from. */
  private activePhase(): SessionState {
    return this.state === "paused" ? this.pausedFromState : this.state;
  }

  private currentRemaining(): number {
    return Math.max(0, this.pausedRemainingMs ?? this.deadline - Date.now());
  }

  private setRemaining(ms: number): void {
    if (this.state === "paused") this.pausedRemainingMs = ms;
    else this.deadline = Date.now() + ms;
  }

  private buildFinishResult(): SessionFinishResult | null {
    if (this.state === "idle" || !this.config) return null;
    const imagesDrawn = this.completed.length;
    return {
      imagesDrawn,
      durationSeconds: this.config.durationSeconds,
      minutes: Math.round(this.drawnMs / 60000),
      folderId: this.config.folderId,
      folderName: this.config.folderName,
      images: this.completed.map((i) => this.playlist[i].path),
    };
  }

  private tick(): void {
    if (this.state !== "observe" && this.state !== "running" && this.state !== "break") return;
    const remaining = this.deadline - Date.now();
    if (remaining > 0) {
      this.emitUpdate();
      return;
    }

    if (this.state === "observe") {
      this.startDrawing();
    } else if (this.state === "running") {
      // drawing time ran out -> this image counts (once, even if revisited with previous())
      if (!this.completed.includes(this.currentIndex)) {
        this.completed.push(this.currentIndex);
        this.drawnMs += this.carriedDrawMs + this.phaseLengthMs;
      }
      const shown = this.currentIndex - this.startIndex + 1;
      const reachedEnd = shown >= this.totalCount;
      if (reachedEnd) {
        const result = this.buildFinishResult();
        this.stopInternal();
        this.emit("finished", result);
        this.emitUpdate();
        return;
      }
      const cfg = this.config!;
      if (cfg.breaksEnabled && shown % cfg.breakEvery === 0) {
        this.state = "break";
        this.phaseLengthMs = cfg.breakSeconds * 1000;
        this.deadline = Date.now() + this.phaseLengthMs;
      } else {
        this.advance();
      }
    } else {
      this.advance();
    }
    this.emitUpdate();
  }

  private advance(): void {
    this.currentIndex += 1;
    this.beginImage();
  }

  /** Start the current image: observe phase first when enabled, then drawing. */
  private beginImage(): void {
    const cfg = this.config!;
    this.pausedRemainingMs = null; // next/previous while paused start the new image running
    this.carriedDrawMs = 0;
    if (cfg.observeEnabled && cfg.observeSeconds > 0) {
      this.state = "observe";
      this.phaseLengthMs = cfg.observeSeconds * 1000;
      this.deadline = Date.now() + this.phaseLengthMs;
    } else {
      this.startDrawing();
    }
  }

  private startDrawing(): void {
    this.state = "running";
    this.phaseLengthMs = this.config!.durationSeconds * 1000;
    this.deadline = Date.now() + this.phaseLengthMs;
  }

  private stopInternal(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state = "idle";
    this.pausedRemainingMs = null;
  }

  private emitUpdate(): void {
    this.emit("update", this.getSnapshot());
  }
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
