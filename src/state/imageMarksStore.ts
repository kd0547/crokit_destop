import { create } from "zustand";

/**
 * Per-image favorite / hidden marks.
 * UI only for now: kept in memory, not saved to the backend, and hidden images
 * are only dimmed (sessions still include them).
 */
interface ImageMarksState {
  favorites: Set<string>;
  hidden: Set<string>;
  toggleFavorite: (key: string) => void;
  toggleHidden: (key: string) => void;
}

export function imageKey(folderId: string, path: string): string {
  return `${folderId}\u0000${path}`;
}

function toggled(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export const useImageMarksStore = create<ImageMarksState>((set) => ({
  favorites: new Set(),
  hidden: new Set(),
  toggleFavorite: (key) => set((s) => ({ favorites: toggled(s.favorites, key) })),
  toggleHidden: (key) => set((s) => ({ hidden: toggled(s.hidden, key) })),
}));
