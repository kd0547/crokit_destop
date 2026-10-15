import { create } from "zustand";
import { api } from "@/api/client";
import type { FolderFile, FolderInfo, FolderSelectionItem } from "@/types";

interface FolderStoreState {
  folders: FolderInfo[];
  /** playlist built from settings.folder_selection */
  files: FolderFile[];
  loading: boolean;

  fetchFolders: () => Promise<void>;
  fetchSelectionFiles: (items: FolderSelectionItem[]) => Promise<void>;
  addFolder: (path: string, name?: string) => Promise<FolderInfo>;
  removeFolder: (id: string) => Promise<void>;
}

// rapid checkbox clicks fire overlapping requests; only the latest may land
let filesRequest = 0;

export const useFolderStore = create<FolderStoreState>((set) => ({
  folders: [],
  files: [],
  loading: false,

  fetchFolders: async () => {
    const folders = await api.listFolders();
    set({ folders });
  },

  fetchSelectionFiles: async (items) => {
    const token = ++filesRequest;
    if (items.length === 0) {
      set({ files: [], loading: false });
      return;
    }
    set({ loading: true });
    try {
      const files = await api.listSelectionFiles(items);
      if (token === filesRequest) set({ files, loading: false });
    } catch {
      if (token === filesRequest) set({ files: [], loading: false });
    }
  },

  addFolder: async (path, name) => {
    const folder = await api.addFolder(path, name);
    set((s) => ({ folders: [...s.folders, folder] }));
    return folder;
  },

  removeFolder: async (id) => {
    await api.deleteFolder(id);
    set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }));
  },
}));
