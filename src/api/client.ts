import type { FolderFile, FolderInfo, FolderSelectionItem, HistoryEntry, ImageFlags, ImageFlagsResult, Settings } from "@/types";

const base = () => window.crokit.apiBase;

/**
 * Adds the per-launch token as ?t= for URLs loaded without fetch headers
 * (<img src>, WebSocket). See python/app/security.py.
 */
export function withToken(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t=${encodeURIComponent(window.crokit.apiToken)}`;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Crokit-Token": window.crokit.apiToken,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, `${init?.method ?? "GET"} ${path} failed: ${res.status} ${body}`, parseDetail(body));
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** FastAPI's `detail` message, shown to the user as-is */
    public detail: string | null,
  ) {
    super(message);
  }
}

function parseDetail(body: string): string | null {
  try {
    const detail = JSON.parse(body).detail;
    return typeof detail === "string" ? detail : null;
  } catch {
    return null;
  }
}

export function fileUrl(absPath: string): string {
  return withToken(`${base()}/files?path=${encodeURIComponent(absPath)}`);
}

export function thumbUrl(folderId: string, absPath: string): string {
  return withToken(`${base()}/thumbnail/file?folder_id=${encodeURIComponent(folderId)}&path=${encodeURIComponent(absPath)}`);
}

export function practiceThumbUrl(sessionId: string, orderIndex: number): string {
  return withToken(`${base()}/history/${encodeURIComponent(sessionId)}/images/${orderIndex}/thumbnail`);
}

export const api = {
  getSettings: () => req<Settings>("/settings"),
  updateSettings: (fields: Partial<Settings>) => req<Settings>("/settings", { method: "PUT", body: JSON.stringify(fields) }),

  listFolders: () => req<FolderInfo[]>("/folders"),
  addFolder: (path: string, name?: string) => req<FolderInfo>("/folders", { method: "POST", body: JSON.stringify({ path, name }) }),
  deleteFolder: (id: string) => req<{ ok: boolean }>(`/folders/${id}`, { method: "DELETE" }),
  /** images directly inside one (sub)folder */
  listFolderFiles: (id: string, relPath = "") => req<FolderFile[]>(`/folders/${id}/files?rel_path=${encodeURIComponent(relPath)}`),
  /** playlist for a multi-folder selection */
  listSelectionFiles: (items: FolderSelectionItem[]) => req<FolderFile[]>("/folders/files", { method: "POST", body: JSON.stringify({ items }) }),
  /** favorite / hidden marks for images in one folder; fields left out stay as they are */
  setImageFlags: (folderId: string, paths: string[], flags: Partial<ImageFlags>) =>
    req<ImageFlagsResult[]>(`/folders/${encodeURIComponent(folderId)}/flags`, { method: "PUT", body: JSON.stringify({ paths, ...flags }) }),

  getGifFrames: (path: string) => req<{ frames: string[] }>(`/gif/frames?path=${encodeURIComponent(path)}`),

  listHistory: () => req<HistoryEntry[]>("/history"),
  getHistoryStats: () => req<{ sessions: number; minutes: number }>("/history/stats"),
};
