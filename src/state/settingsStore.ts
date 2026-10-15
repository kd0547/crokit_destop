import { create } from "zustand";
import { api } from "@/api/client";
import type { Settings } from "@/types";

interface SettingsStoreState {
  settings: Settings | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (fields: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  settings: null,
  fetchSettings: async () => {
    const settings = await api.getSettings();
    set({ settings });
  },
  updateSettings: async (fields) => {
    const settings = await api.updateSettings(fields);
    set({ settings });
  },
}));
