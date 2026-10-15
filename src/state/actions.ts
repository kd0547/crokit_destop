import { api, ApiError } from "@/api/client";
import { compressSelection, expandSelection, findNode, nodeKey, selectedTotals, selectionLabel, setSubtree, stateOf } from "@/lib/folderTree";
import type { FolderInfo, FolderSelectionItem, Hotkey, PlaylistEntry, SessionConfig } from "@/types";
import { useFolderStore } from "./folderStore";
import { useSettingsStore } from "./settingsStore";
import { useSessionStore } from "./sessionStore";
import { useUiStore } from "./uiStore";

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function wake(): void {
  const ui = useUiStore.getState();
  if (!ui.uiAwake) ui.setUiAwake(true);
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    const state = useSessionStore.getState().snapshot.state;
    if (state === "observe" || state === "running" || state === "break") useUiStore.getState().setUiAwake(false);
  }, 1800);
}

export async function initApp(): Promise<void> {
  await useSettingsStore.getState().fetchSettings();
  await useFolderStore.getState().fetchFolders();
  const settings = useSettingsStore.getState().settings;
  if (!settings) return;
  // one-time migration from the old single-folder pick (now including its subfolders)
  const legacy = settings.current_folder_id;
  if (settings.folder_selection.length === 0 && legacy && useFolderStore.getState().folders.some((f) => f.id === legacy)) {
    await saveSelection([{ folder_id: legacy, rel_path: "", recursive: true }]);
    return;
  }
  await useFolderStore.getState().fetchSelectionFiles(settings.folder_selection);
}

export async function addFolderViaDialog(): Promise<void> {
  const path = await window.crokit.dialog.selectFolder();
  if (path) await addFolderPath(path);
}

/** register a folder (dialog or drag & drop) and show it in the library */
export async function addFolderPath(path: string): Promise<void> {
  let folder: FolderInfo;
  try {
    folder = await useFolderStore.getState().addFolder(path);
  } catch (err) {
    useUiStore.getState().showNotice(err instanceof ApiError && err.detail ? err.detail : "폴더를 등록하지 못했습니다");
    return;
  }
  // first folder: select it right away so the start button works without a detour
  if (selectionItems().length === 0) await saveSelection([{ folder_id: folder.id, rel_path: "", recursive: true }]);
  useUiStore.getState().setLibraryPath({ folderId: folder.id, relPath: "" });
  useUiStore.getState().setBrowsing(true);
  useUiStore.getState().showNotice(`'${folder.name}' 폴더를 등록했습니다 · ${folder.count}장`);
}

export async function removeFolder(id: string): Promise<void> {
  const folderStore = useFolderStore.getState();
  const target = folderStore.folders.find((f) => f.id === id);
  if (!target) return;
  if (!window.confirm(`'${target.name}' 폴더를 목록에서 삭제할까요?\n(실제 파일은 삭제되지 않습니다)`)) return;

  await folderStore.removeFolder(id);
  const ui = useUiStore.getState();
  if (ui.libraryPath?.folderId === id) ui.setLibraryPath(null);
  // server also dropped this folder from folder_selection
  await useSettingsStore.getState().fetchSettings();
  await refreshSelectionFiles();
}

/** re-scan registered folders on disk (files may have been added/moved since) */
export async function rescanFolders(): Promise<void> {
  await useFolderStore.getState().fetchFolders();
  const ui = useUiStore.getState();
  const folders = useFolderStore.getState().folders;
  const loc = ui.libraryPath;
  if (loc) {
    const folder = folders.find((f) => f.id === loc.folderId);
    if (!folder) ui.setLibraryPath(null);
    else if (!findNode(folder, loc.relPath)) ui.setLibraryPath({ folderId: folder.id, relPath: "" });
  }
  await refreshSelectionFiles();
}

// ---------- folder selection ----------

function selectionItems(): FolderSelectionItem[] {
  return useSettingsStore.getState().settings?.folder_selection ?? [];
}

export function selectionKeys(): Set<string> {
  return expandSelection(useFolderStore.getState().folders, selectionItems());
}

async function refreshSelectionFiles(): Promise<void> {
  await useFolderStore.getState().fetchSelectionFiles(selectionItems());
  useUiStore.getState().setCurrentIndex(0, true);
}

// selection PUTs go out one at a time, so the server ends on the last click
let selectionSaves: Promise<unknown> = Promise.resolve();

async function saveSelection(items: FolderSelectionItem[]): Promise<void> {
  const s = useSettingsStore.getState().settings;
  if (!s) return;
  // applied locally right away (not from the PUT response) so quick successive clicks build on the latest selection
  useSettingsStore.setState({ settings: { ...s, folder_selection: items, current_folder_id: null } });
  selectionSaves = selectionSaves.then(() => api.updateSettings({ folder_selection: items, current_folder_id: null })).catch(() => undefined);
  await useFolderStore.getState().fetchSelectionFiles(items);
  useUiStore.getState().setCurrentIndex(0, true);
}

function saveKeys(keys: Set<string>): Promise<void> {
  return saveSelection(compressSelection(useFolderStore.getState().folders, keys));
}

/** checkbox: the folder and all its subfolders */
export async function toggleFolderSelection(folderId: string, relPath: string): Promise<void> {
  const folders = useFolderStore.getState().folders;
  const folder = folders.find((f) => f.id === folderId);
  const node = folder && findNode(folder, relPath);
  if (!node) return;
  const keys = selectionKeys();
  const all = stateOf(folderId, node, selectedTotals(folders, keys)) === "all";
  setSubtree(keys, folderId, node, !all);
  await saveKeys(keys);
}

/** only the images directly inside the folder (not its subfolders) */
export async function toggleFolderDirect(folderId: string, relPath: string): Promise<void> {
  const keys = selectionKeys();
  const k = nodeKey(folderId, relPath);
  if (keys.has(k)) keys.delete(k);
  else keys.add(k);
  await saveKeys(keys);
}

export async function removeSelectionItem(item: FolderSelectionItem): Promise<void> {
  const folder = useFolderStore.getState().folders.find((f) => f.id === item.folder_id);
  const node = folder && findNode(folder, item.rel_path);
  if (!node) {
    await saveSelection(selectionItems().filter((i) => i !== item));
    return;
  }
  const keys = selectionKeys();
  if (item.recursive) setSubtree(keys, item.folder_id, node, false);
  else keys.delete(nodeKey(item.folder_id, item.rel_path));
  await saveKeys(keys);
}

export async function clearSelection(): Promise<void> {
  await saveSelection([]);
}

export async function toggleAlwaysOnTop(): Promise<void> {
  const s = useSettingsStore.getState().settings;
  if (!s) return;
  const flag = !s.always_on_top;
  await window.crokit.window.setAlwaysOnTop(flag);
  await useSettingsStore.getState().updateSettings({ always_on_top: flag });
}

export async function togglePanel(): Promise<void> {
  const s = useSettingsStore.getState().settings;
  if (!s) return;
  await useSettingsStore.getState().updateSettings({ panel_open: !s.panel_open });
}

/** Step through the current folder while no session is running (wraps around). */
export function browseStep(delta: number): void {
  const count = useFolderStore.getState().files.length;
  if (count === 0) return;
  const ui = useUiStore.getState();
  ui.setCurrentIndex((ui.currentIndex + delta + count) % count, true);
}

export function openInBrowsing(index: number): void {
  useUiStore.getState().setCurrentIndex(index, true);
  useUiStore.getState().setBrowsing(false);
}

function buildPlaylist(): PlaylistEntry[] {
  return useFolderStore.getState().files.map((f) => ({ path: f.path, isGif: f.is_gif }));
}

export async function startSession(): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  const files = useFolderStore.getState().files;
  const folders = useFolderStore.getState().folders;
  if (!settings || files.length === 0) return;
  const items = settings.folder_selection;
  const rootIds = new Set(items.map((i) => i.folder_id));
  const ui = useUiStore.getState();
  const startAt = ui.done ? 0 : ui.currentIndex;

  const config: SessionConfig = {
    isRandom: settings.order_mode === "random",
    targetCount: settings.count,
    durationSeconds: settings.duration_seconds,
    observeEnabled: settings.observe_enabled,
    observeSeconds: settings.observe_seconds,
    breaksEnabled: settings.breaks_enabled,
    breakEvery: settings.break_every,
    breakSeconds: settings.break_seconds,
    // history keeps one folder reference; mixed-folder sessions resolve per image on the server
    folderId: rootIds.size === 1 ? [...rootIds][0] : null,
    folderName: selectionLabel(folders, items),
  };

  if (settings.auto_hide && settings.panel_open) {
    await useSettingsStore.getState().updateSettings({ panel_open: false });
  }
  useUiStore.getState().setBrowsing(false);
  useUiStore.getState().setDone(null);
  await window.crokit.session.start(buildPlaylist(), config, startAt);
  wake();
}

export async function stopSession(): Promise<void> {
  await window.crokit.session.stop();
  useUiStore.getState().setUiAwake(true);
}

export function togglePause(): void {
  const state = useSessionStore.getState().snapshot.state;
  if (state === "observe" || state === "running" || state === "break") window.crokit.session.pause();
  else if (state === "paused") window.crokit.session.resume();
  wake();
}

export function nextPhoto(): void {
  window.crokit.session.next();
}

export function prevPhoto(): void {
  window.crokit.session.previous();
}

function customSecs(): number {
  const ui = useUiStore.getState();
  return Math.max(1, ui.customH * 3600 + ui.customM * 60 + ui.customS);
}

export async function addDurationPreset(): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  if (!settings) return;
  const seconds = customSecs();
  const exists = settings.duration_presets.some((p) => p.seconds === seconds);
  const duration_presets = exists
    ? settings.duration_presets
    : [...settings.duration_presets, { seconds, isUser: true }].sort((a, b) => a.seconds - b.seconds);
  await useSettingsStore.getState().updateSettings({ duration_presets, duration_seconds: seconds });
  useUiStore.getState().setEditorOpen(false);
}

export async function removeDurationPreset(seconds: number): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  if (!settings) return;
  const duration_presets = settings.duration_presets.filter((p) => p.seconds !== seconds);
  const duration_seconds = settings.duration_seconds === seconds ? 60 : settings.duration_seconds;
  await useSettingsStore.getState().updateSettings({ duration_presets, duration_seconds });
}

export async function selectDuration(seconds: number): Promise<void> {
  await useSettingsStore.getState().updateSettings({ duration_seconds: seconds });
}

export async function addCountPreset(): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  if (!settings) return;
  const count = useUiStore.getState().customCount;
  const exists = settings.count_presets.some((p) => p.count === count);
  const count_presets = exists
    ? settings.count_presets
    : [...settings.count_presets, { count, isUser: true }].sort((a, b) => a.count - b.count);
  await useSettingsStore.getState().updateSettings({ count_presets, count });
  useUiStore.getState().setCountEditorOpen(false);
}

export async function removeCountPreset(count: number): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  if (!settings) return;
  const count_presets = settings.count_presets.filter((p) => p.count !== count);
  const nextCount = settings.count === count ? 20 : settings.count;
  await useSettingsStore.getState().updateSettings({ count_presets, count: nextCount });
}

export async function selectCount(count: number): Promise<void> {
  await useSettingsStore.getState().updateSettings({ count });
}

export async function setOrderMode(mode: "random" | "seq"): Promise<void> {
  await useSettingsStore.getState().updateSettings({ order_mode: mode });
}

export async function addObservePreset(): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  if (!settings) return;
  const seconds = useUiStore.getState().customObserve;
  const exists = settings.observe_presets.some((p) => p.seconds === seconds);
  const observe_presets = exists
    ? settings.observe_presets
    : [...settings.observe_presets, { seconds, isUser: true }].sort((a, b) => a.seconds - b.seconds);
  await useSettingsStore.getState().updateSettings({ observe_presets, observe_enabled: true, observe_seconds: seconds });
  useUiStore.getState().setObserveEditorOpen(false);
}

export async function removeObservePreset(seconds: number): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  if (!settings) return;
  const observe_presets = settings.observe_presets.filter((p) => p.seconds !== seconds);
  const observe_seconds = settings.observe_seconds === seconds ? 10 : settings.observe_seconds;
  await useSettingsStore.getState().updateSettings({ observe_presets, observe_seconds });
}

/** null = observe off */
export async function selectObserve(seconds: number | null): Promise<void> {
  await useSettingsStore.getState().updateSettings(seconds === null ? { observe_enabled: false } : { observe_enabled: true, observe_seconds: seconds });
}

export async function setBreakEvery(n: number): Promise<void> {
  await useSettingsStore.getState().updateSettings({ break_every: Math.min(99, Math.max(1, n)) });
}

export async function setBreakSeconds(n: number): Promise<void> {
  await useSettingsStore.getState().updateSettings({ break_seconds: Math.min(600, Math.max(1, n)) });
}

type BoolSettingKey = "gray" | "flip" | "grid" | "sound" | "auto_hide" | "observe_enabled" | "breaks_enabled";

export async function toggleSetting(key: BoolSettingKey): Promise<void> {
  const s = useSettingsStore.getState().settings;
  if (!s) return;
  await useSettingsStore.getState().updateSettings({ [key]: !s[key] } as Partial<typeof s>);
}

export async function setFlipHotkey(hotkey: Hotkey | null): Promise<void> {
  await useSettingsStore.getState().updateSettings({ flip_hotkey: hotkey });
}

export function previewGridStyle(hex: string, opacity: number): void {
  const s = useSettingsStore.getState().settings;
  if (!s) return;
  useSettingsStore.setState({ settings: { ...s, grid_color: hex, grid_opacity: opacity } });
}

export async function commitGridStyle(hex: string, opacity: number): Promise<void> {
  await useSettingsStore.getState().updateSettings({ grid_color: hex, grid_opacity: opacity });
}

export function previewGridDivisions(n: number): void {
  const s = useSettingsStore.getState().settings;
  if (!s) return;
  useSettingsStore.setState({ settings: { ...s, grid_divisions: n } });
}

export async function commitGridDivisions(n: number): Promise<void> {
  await useSettingsStore.getState().updateSettings({ grid_divisions: n });
}

export async function loadGifFrames(path: string): Promise<void> {
  try {
    const { frames } = await api.getGifFrames(path);
    useUiStore.getState().setGifFrames(frames);
    useUiStore.getState().resetGif();
  } catch {
    useUiStore.getState().setGifFrames([]);
  }
}

export function gifStep(delta: number): void {
  const ui = useUiStore.getState();
  const max = ui.gifFrames.length - 1;
  if (max < 0) return;
  ui.setGifPlaying(false);
  ui.setGifFrame(Math.min(max, Math.max(0, ui.gifFrame + delta)));
}

export function gifTogglePlay(): void {
  const ui = useUiStore.getState();
  const playing = ui.gifPlaying && !ui.gifFrozen;
  ui.setGifPlaying(!playing);
  ui.setGifFrozen(false);
}

export function gifSetA(): void {
  const ui = useUiStore.getState();
  ui.setGifRange(Math.min(ui.gifFrame, ui.gifB), ui.gifB);
}

export function gifSetB(): void {
  const ui = useUiStore.getState();
  ui.setGifRange(ui.gifA, Math.max(ui.gifFrame, ui.gifA));
}

export function gifClearRange(): void {
  const ui = useUiStore.getState();
  ui.setGifRange(0, Math.max(0, ui.gifFrames.length - 1));
}

export function gifToggleFreeze(): void {
  const wasFrozen = useUiStore.getState().gifFrozen;
  useUiStore.setState({ gifFrozen: !wasFrozen, gifPlaying: wasFrozen });
}
