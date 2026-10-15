import type { FolderInfo, FolderNode, FolderSelectionItem } from "@/types";

/**
 * Folder selection model.
 *
 * Persisted form (settings.folder_selection) is a compact list of items:
 * `recursive` = the folder and everything under it, otherwise only the images
 * directly inside it. In memory the selection is expanded to a set of node keys
 * whose *direct* images are selected, which makes tri-state checkboxes and
 * toggling simple; compressSelection() turns it back into the compact form
 * (so a fully selected folder also picks up subfolders added later on disk).
 */

export type SelectState = "none" | "some" | "all";

export interface NodeRef {
  folder: FolderInfo;
  node: FolderNode;
}

// "|" can't appear in a Windows path, so it safely separates id and rel_path
export const nodeKey = (folderId: string, relPath: string) => `${folderId}|${relPath}`;

export function findNode(folder: FolderInfo, relPath: string): FolderNode | null {
  let node: FolderNode = folder.tree;
  while (node.rel_path !== relPath) {
    const next = node.children.find((c) => relPath === c.rel_path || relPath.startsWith(c.rel_path + "/"));
    if (!next) return null;
    node = next;
  }
  return node;
}

/** root → node, inclusive */
export function nodeTrail(folder: FolderInfo, relPath: string): FolderNode[] {
  const trail: FolderNode[] = [folder.tree];
  let node = folder.tree;
  while (node.rel_path !== relPath) {
    const next = node.children.find((c) => relPath === c.rel_path || relPath.startsWith(c.rel_path + "/"));
    if (!next) break;
    trail.push(next);
    node = next;
  }
  return trail;
}

export function walkNode(node: FolderNode, fn: (n: FolderNode) => void): void {
  fn(node);
  node.children.forEach((c) => walkNode(c, fn));
}

export function expandSelection(folders: FolderInfo[], items: FolderSelectionItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    const folder = folders.find((f) => f.id === item.folder_id);
    const node = folder && findNode(folder, item.rel_path);
    if (!folder || !node) continue;
    if (item.recursive) walkNode(node, (n) => n.count > 0 && keys.add(nodeKey(folder.id, n.rel_path)));
    else if (node.count > 0) keys.add(nodeKey(folder.id, node.rel_path));
  }
  return keys;
}

/** selected image count per node (subtree), keyed by nodeKey */
export function selectedTotals(folders: FolderInfo[], keys: Set<string>): Map<string, number> {
  const totals = new Map<string, number>();
  const visit = (folderId: string, node: FolderNode): number => {
    let sum = keys.has(nodeKey(folderId, node.rel_path)) ? node.count : 0;
    for (const c of node.children) sum += visit(folderId, c);
    totals.set(nodeKey(folderId, node.rel_path), sum);
    return sum;
  };
  folders.forEach((f) => visit(f.id, f.tree));
  return totals;
}

export function stateOf(folderId: string, node: FolderNode, totals: Map<string, number>): SelectState {
  const sel = totals.get(nodeKey(folderId, node.rel_path)) ?? 0;
  if (sel === 0 || node.total === 0) return "none";
  return sel >= node.total ? "all" : "some";
}

export function setSubtree(keys: Set<string>, folderId: string, node: FolderNode, on: boolean): void {
  walkNode(node, (n) => {
    if (n.count === 0) return;
    const k = nodeKey(folderId, n.rel_path);
    if (on) keys.add(k);
    else keys.delete(k);
  });
}

export function compressSelection(folders: FolderInfo[], keys: Set<string>): FolderSelectionItem[] {
  const totals = selectedTotals(folders, keys);
  const items: FolderSelectionItem[] = [];
  const visit = (folderId: string, node: FolderNode) => {
    const state = stateOf(folderId, node, totals);
    if (state === "all") items.push({ folder_id: folderId, rel_path: node.rel_path, recursive: true });
    else if (state === "some") {
      if (keys.has(nodeKey(folderId, node.rel_path))) items.push({ folder_id: folderId, rel_path: node.rel_path, recursive: false });
      node.children.forEach((c) => visit(folderId, c));
    }
  };
  folders.forEach((f) => visit(f.id, f.tree));
  return items;
}

/** "포즈 › 여성" style label for a selection item ("" when its folder is gone) */
export function itemLabel(folders: FolderInfo[], item: FolderSelectionItem): { parent: string | null; name: string } {
  const folder = folders.find((f) => f.id === item.folder_id);
  if (!folder) return { parent: null, name: "" };
  const trail = nodeTrail(folder, item.rel_path);
  const node = trail[trail.length - 1];
  return { parent: trail.length > 1 ? trail[trail.length - 2].name : null, name: node.name };
}

/** short name for history / the window title: "여성", "포즈 › 여성 외 2개" */
export function selectionLabel(folders: FolderInfo[], items: FolderSelectionItem[]): string {
  if (items.length === 0) return "";
  const { parent, name } = itemLabel(folders, items[0]);
  const first = parent ? `${parent} › ${name}` : name;
  return items.length > 1 ? `${first} 외 ${items.length - 1}개` : first;
}

/** every node across all folders, for search */
export function allNodeRefs(folders: FolderInfo[]): NodeRef[] {
  const out: NodeRef[] = [];
  folders.forEach((folder) => walkNode(folder.tree, (node) => out.push({ folder, node })));
  return out;
}
