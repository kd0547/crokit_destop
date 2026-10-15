import { create } from "zustand";
import { api } from "@/api/client";
import type { HistoryEntry } from "@/types";

interface HistoryStoreState {
  entries: HistoryEntry[];
  stats: { sessions: number; minutes: number };
  fetchHistory: () => Promise<void>;
}

export const useHistoryStore = create<HistoryStoreState>((set) => ({
  entries: [],
  stats: { sessions: 0, minutes: 0 },
  fetchHistory: async () => {
    const [entries, stats] = await Promise.all([api.listHistory(), api.getHistoryStats()]);
    set({ entries, stats });
  },
}));
