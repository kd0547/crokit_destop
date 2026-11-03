import { useEffect, useMemo, useState } from "react";
import { api, thumbUrl } from "@/api/client";
import { useFolderStore } from "@/state/folderStore";
import { useSessionStore } from "@/state/sessionStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useUiStore } from "@/state/uiStore";
import {
  addFolderViaDialog,
  clearSelection,
  openInBrowsing,
  removeFolder,
  removeSelectionItem,
  rescanFolders,
  setImageFlags,
  startSession,
  toggleFolderDirect,
  toggleFolderSelection,
} from "@/state/actions";
import { allNodeRefs, expandSelection, findNode, itemLabel, nodeKey, nodeTrail, selectedTotals, stateOf, type SelectState } from "@/lib/folderTree";
import type { FolderFile, FolderInfo, FolderNode, FolderSelectionItem, ImageFlags } from "@/types";
import { useT } from "@/i18n";

const CARD_SIZES = { small: 168, large: 236 } as const;
type CardSize = keyof typeof CARD_SIZES;
const SEARCH_LIMIT = 120;

/**
 * Stage overlay for picking practice folders: registered folders and their
 * subfolders as cover cards. Clicking a card opens it, its checkbox selects it
 * (with all subfolders). Selected folders gather in the tray at the bottom.
 */
export function LibraryLayer() {
  const t = useT();
  const folders = useFolderStore((s) => s.folders);
  const files = useFolderStore((s) => s.files);
  const items = useSettingsStore((s) => s.settings?.folder_selection ?? []);
  const libraryPath = useUiStore((s) => s.libraryPath);
  const setLibraryPath = useUiStore((s) => s.setLibraryPath);
  const setBrowsing = useUiStore((s) => s.setBrowsing);
  const running = useSessionStore((s) => s.snapshot.state !== "idle");
  const [query, setQuery] = useState("");
  const [cardSize, setCardSize] = useState<CardSize>("large");
  const [scanning, setScanning] = useState(false);
  // photos picked with Ctrl/Shift+click in the open folder (see DirectImages)
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  const keys = useMemo(() => expandSelection(folders, items), [folders, items]);
  const totals = useMemo(() => selectedTotals(folders, keys), [folders, keys]);
  // the playlist itself, so hidden images aren't counted
  const selectedCount = files.length;

  const folder = libraryPath ? folders.find((f) => f.id === libraryPath.folderId) ?? null : null;
  const node = folder && libraryPath ? findNode(folder, libraryPath.relPath) ?? folder.tree : null;

  const goUp = () => {
    if (!folder || !node) return;
    if (node.rel_path === "") setLibraryPath(null);
    else setLibraryPath({ folderId: folder.id, relPath: node.rel_path.split("/").slice(0, -1).join("/") });
  };
  const go = (p: { folderId: string; relPath: string } | null) => {
    setQuery("");
    setLibraryPath(p);
  };
  const open = (f: FolderInfo, n: FolderNode) => go({ folderId: f.id, relPath: n.rel_path });

  useEffect(() => {
    // capture phase so the global shortcuts (Esc = stop session, arrows = photo nav) don't also fire
    const onKeyDown = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === "INPUT";
      if (e.key === "Escape") {
        if (picked.size > 0) setPicked(new Set());
        else if (query) setQuery("");
        else setBrowsing(false);
      } else if (e.key === "Backspace" && !typing && libraryPath) goUp();
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (typing) return;
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  // a new folder (or search) starts with nothing picked
  useEffect(() => setPicked(new Set()), [libraryPath?.folderId, libraryPath?.relPath, query]);

  const rescan = async () => {
    setScanning(true);
    try {
      await rescanFolders();
    } finally {
      setScanning(false);
    }
  };

  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_SIZES[cardSize]}px, 1fr))`, gap: 14, marginBottom: 28 };

  let body: React.ReactNode;
  if (query) {
    const q = query.toLowerCase();
    const hits = allNodeRefs(folders).filter((r) => r.node.name.toLowerCase().includes(q));
    body = (
      <>
        <SectionTitle>{t("library.searchResults", query, hits.length)}</SectionTitle>
        {hits.length === 0 ? (
          <Empty>{t("library.noMatch")}</Empty>
        ) : (
          <div style={grid}>
            {hits.slice(0, SEARCH_LIMIT).map((r) => (
              <FolderCard key={nodeKey(r.folder.id, r.node.rel_path)} folder={r.folder} node={r.node} state={stateOf(r.folder.id, r.node, totals)} crumb onOpen={() => open(r.folder, r.node)} query={query} />
            ))}
          </div>
        )}
      </>
    );
  } else if (!folder || !node) {
    body = (
      <>
        <Heading title={t("library.title")} meta={t("library.meta", folders.length, folders.reduce((s, f) => s + f.count, 0))} />
        <SectionTitle>{t("library.registered")}</SectionTitle>
        <div style={grid}>
          {folders.map((f) => (
            <FolderCard key={f.id} folder={f} node={f.tree} state={stateOf(f.id, f.tree, totals)} onOpen={() => open(f, f.tree)} onRemove={running ? undefined : () => removeFolder(f.id)} />
          ))}
          <button
            className="lib-card"
            onClick={addFolderViaDialog}
            style={{ display: "flex", flexDirection: "column", gap: 8, padding: 0, textAlign: "left" }}
          >
            <div
              className="lib-cover"
              style={{
                aspectRatio: "4/3",
                borderRadius: 10,
                border: "1.5px dashed var(--color-border-strong)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                color: "var(--color-neutral-500)",
                fontSize: 12,
              }}
            >
              <i className="ph ph-folder-simple-plus" style={{ fontSize: 26 }} />
              {t("folders.add")}
              <span style={{ fontSize: 11, color: "var(--color-neutral-700)", padding: "0 10px", textAlign: "center" }}>{t("library.dropHint")}</span>
            </div>
          </button>
        </div>
      </>
    );
  } else {
    const state = stateOf(folder.id, node, totals);
    const hasKids = node.children.length > 0;
    const absPath = node.rel_path ? `${folder.path}\\${node.rel_path.replace(/\//g, "\\")}` : folder.path;
    body = (
      <>
        <Heading
          title={node.name}
          meta={`${absPath} · ${hasKids ? t("library.nodeMetaWithSubfolders", node.total, node.children.length) : t("unit.images", node.total)}`}
          action={
            <button
              className={`btn ${state === "all" ? "btn-ghost" : "btn-primary"}`}
              onClick={() => toggleFolderSelection(folder.id, node.rel_path)}
              disabled={node.total === 0}
              style={{ flex: "none", height: 34, padding: "0 14px", fontSize: 13 }}
            >
              <i className={`ph ${state === "all" ? "ph-check-square" : "ph-plus-square"}`} style={{ fontSize: 15 }} />
              {state === "all" ? t("library.selectedDeselect") : hasKids ? t("library.selectAllWithSubfolders") : t("library.selectThisFolder")}
            </button>
          }
        />
        {hasKids && (
          <>
            <SectionTitle>{t("library.subfolders", node.children.length)}</SectionTitle>
            <div style={grid}>
              {node.children.map((c) => (
                <FolderCard key={c.rel_path} folder={folder} node={c} state={stateOf(folder.id, c, totals)} onOpen={() => open(folder, c)} />
              ))}
            </div>
          </>
        )}
        {node.count > 0 && <DirectImages folder={folder} node={node} hasKids={hasKids} selected={keys.has(nodeKey(folder.id, node.rel_path))} files={files} picked={picked} setPicked={setPicked} />}
        {node.total === 0 && <Empty>{t("library.noImagesHere")}</Empty>}
      </>
    );
  }

  const trail = folder && node ? nodeTrail(folder, node.rel_path) : [];

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 8, background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 10px 14px", borderBottom: "1px solid var(--color-border)" }}>
        <button className="btn btn-ghost btn-icon" title={t("library.up")} onClick={goUp} disabled={!folder || !!query} style={{ flex: "none", width: 30, height: 30 }}>
          <i className="ph ph-arrow-up" style={{ fontSize: 15 }} />
        </button>
        <nav style={{ flex: "0 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 2, overflow: "hidden", fontSize: 13 }}>
          <Crumb current={!folder} onClick={() => go(null)}>
            <i className="ph ph-books" style={{ fontSize: 14 }} />
            {t("library.title")}
          </Crumb>
          {folder &&
            trail.map((n, i) => (
              <span key={n.rel_path} style={{ display: "contents" }}>
                <i className="ph ph-caret-right" style={{ flex: "none", fontSize: 11, color: "var(--color-neutral-800)" }} />
                <Crumb current={i === trail.length - 1} onClick={() => go({ folderId: folder.id, relPath: n.rel_path })}>
                  {n.name}
                </Crumb>
              </span>
            ))}
        </nav>
        <div style={{ flex: 1 }} />
        <label
          style={{
            flex: "0 1 220px",
            minWidth: 110,
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 30,
            padding: "0 10px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border-2)",
          }}
        >
          <i className="ph ph-magnifying-glass" style={{ color: "var(--color-neutral-600)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.trim() ? e.target.value : "")}
            placeholder={t("library.searchPlaceholder")}
            style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 12.5 }}
          />
        </label>
        <button className="btn btn-ghost btn-icon" title={t("library.rescan")} onClick={rescan} disabled={scanning} style={{ flex: "none", width: 30, height: 30 }}>
          <i className="ph ph-arrows-clockwise" style={{ fontSize: 15 }} />
        </button>
        <div style={{ flex: "none", display: "flex", gap: 2, padding: 2, borderRadius: "var(--radius-md)", background: "var(--color-surface-2)", border: "1px solid var(--color-border-2)" }}>
          {(["small", "large"] as const).map((size) => (
            <button
              key={size}
              title={size === "small" ? t("library.small") : t("library.large")}
              onClick={() => setCardSize(size)}
              style={{ width: 28, height: 24, borderRadius: 6, background: cardSize === size ? "var(--color-border-3)" : "transparent", color: cardSize === size ? "var(--color-text)" : "var(--color-neutral-600)" }}
            >
              <i className={`ph ${size === "small" ? "ph-dots-nine" : "ph-squares-four"}`} style={{ fontSize: 14 }} />
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-icon" title={t("common.closeEsc")} onClick={() => setBrowsing(false)} style={{ flex: "none", width: 30, height: 30 }}>
          <i className="ph ph-x" style={{ fontSize: 16 }} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 20px 110px" }}>
        {folders.length === 0 ? <FirstRun /> : body}
      </div>

      {folders.length > 0 && <Tray folders={folders} items={items} selectedCount={selectedCount} canStart={files.length > 0 && !running} />}
    </div>
  );

}

function Crumb({ current, onClick, children }: { current: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={current ? undefined : "lib-crumb"}
      onClick={onClick}
      style={{
        flex: current ? "0 1 auto" : "0 0 auto",
        minWidth: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        padding: "0 8px",
        borderRadius: 6,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontWeight: current ? 500 : 400,
        color: current ? "var(--color-text)" : "var(--color-neutral-500)",
      }}
    >
      {children}
    </button>
  );
}

function Heading({ title, meta, action }: { title: string; meta: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 22 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        <div style={{ marginTop: 3, fontSize: 12, color: "var(--color-neutral-600)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>
      </div>
      {action}
    </div>
  );
}

function SectionTitle({ children, lead }: { children: React.ReactNode; lead?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px", fontSize: 11, letterSpacing: ".06em", color: "var(--color-neutral-600)" }}>
      {lead}
      {children}
      <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "16px 2px", fontSize: 12.5, color: "var(--color-neutral-700)" }}>{children}</div>;
}

export function SelectBox({ state, onClick, size = 18, title }: { state: SelectState; onClick: () => void; size?: number; title?: string }) {
  const on = state !== "none";
  return (
    <button
      className="lib-check"
      role="checkbox"
      aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        flex: "none",
        width: size,
        height: size,
        padding: 0,
        borderRadius: Math.round(size / 3.6),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: state === "all" ? "var(--color-accent)" : state === "some" ? "var(--color-accent-800)" : "rgba(7,8,12,.6)",
        border: `1.5px solid ${state === "all" ? "var(--color-accent)" : state === "some" ? "var(--color-accent-600)" : "rgba(233,233,237,.4)"}`,
        color: state === "all" ? "#14121f" : "var(--color-accent-200)",
        backdropFilter: "blur(4px)",
      }}
    >
      {on && <i className={`ph-bold ${state === "all" ? "ph-check" : "ph-minus"}`} style={{ fontSize: size * 0.6 }} />}
    </button>
  );
}

function FolderCard({
  folder,
  node,
  state,
  onOpen,
  onRemove,
  crumb,
  query,
}: {
  folder: FolderInfo;
  node: FolderNode;
  state: SelectState;
  onOpen: () => void;
  onRemove?: () => void;
  crumb?: boolean;
  query?: string;
}) {
  const t = useT();
  const samples = node.samples;
  const parent = crumb ? nodeTrail(folder, node.rel_path).slice(0, -1).map((n) => n.name).join(" › ") : "";
  const mosaic: React.CSSProperties =
    samples.length >= 3
      ? { gridTemplateColumns: "2fr 1fr", gridTemplateRows: "1fr 1fr" }
      : samples.length === 2
        ? { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr" }
        : { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" };

  return (
    <div className="lib-card" onClick={onOpen} title={t("library.openFolder", node.name)} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8, cursor: "pointer", minWidth: 0 }}>
      <div
        className="lib-cover"
        style={{
          position: "relative",
          aspectRatio: "4/3",
          display: "grid",
          gap: 2,
          ...mosaic,
          borderRadius: 10,
          overflow: "hidden",
          background: "linear-gradient(160deg,#1c1d27,#101118)",
          border: `1px solid ${state === "all" ? "var(--color-accent)" : state === "some" ? "var(--color-accent-700)" : "var(--color-divider)"}`,
          boxShadow: state === "all" ? "0 0 0 1px var(--color-accent)" : "none",
        }}
      >
        {samples.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-neutral-800)" }}>
            <i className="ph ph-folder-simple-dashed" style={{ fontSize: 30 }} />
          </div>
        ) : (
          samples.map((path, i) => (
            <img
              key={path}
              src={thumbUrl(folder.id, path)}
              loading="lazy"
              decoding="async"
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "cover", gridRow: samples.length >= 3 && i === 0 ? "span 2" : undefined, minHeight: 0 }}
            />
          ))
        )}
        {node.children.length > 0 && (
          <Badge style={{ top: 8, right: 8 }}>
            <i className="ph ph-folders" style={{ fontSize: 12 }} />
            {t("library.subfolderBadge", node.children.length)}
          </Badge>
        )}
        <Badge className="lib-hover" style={{ right: 8, bottom: 8 }}>
          {t("library.open")}
          <i className="ph ph-arrow-right" style={{ fontSize: 12 }} />
        </Badge>
        {onRemove && (
          <button
            className="lib-hover"
            title={t("library.remove")}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={{ position: "absolute", left: 8, bottom: 8, width: 26, height: 26, borderRadius: 6, background: "rgba(7,8,12,.75)", color: "var(--color-neutral-400)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <i className="ph ph-trash" style={{ fontSize: 14 }} />
          </button>
        )}
      </div>
      <div style={{ position: "absolute", top: 8, left: 8 }}>
        <SelectBox state={state} size={22} title={node.children.length ? t("library.selectWithSubfolders") : t("library.select")} onClick={() => node.total > 0 && toggleFolderSelection(folder.id, node.rel_path)} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 2px", minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <Highlight text={node.name} query={query} />
          </div>
          {crumb && parent && <div style={{ fontSize: 11, color: "var(--color-neutral-700)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{parent}</div>}
        </div>
        <span style={{ flex: "none", fontSize: 11, fontVariantNumeric: "tabular-nums", color: state === "all" ? "var(--color-accent-400)" : "var(--color-neutral-600)" }}>{t("unit.images", node.total)}</span>
      </div>
    </div>
  );
}

function Badge({ children, style, className }: { children: React.ReactNode; style: React.CSSProperties; className?: string }) {
  return (
    <span
      className={className}
      style={{
        position: "absolute",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 22,
        padding: "0 8px",
        borderRadius: 6,
        fontSize: 11,
        background: "rgba(7,8,12,.7)",
        color: "var(--color-neutral-300)",
        backdropFilter: "blur(4px)",
        pointerEvents: "none",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function Highlight({ text, query }: { text: string; query?: string }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (!query || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span style={{ background: "color-mix(in srgb, var(--color-accent) 30%, transparent)", color: "var(--color-accent-100)", borderRadius: 2 }}>{text.slice(i, i + query.length)}</span>
      {text.slice(i + query.length)}
    </>
  );
}

/**
 * images directly inside the open folder; ones outside the current selection
 * are dimmed. Each tile has a favorite toggle (top left) and a hide toggle
 * (bottom right): hidden images are left out of practice sessions.
 *
 * Ctrl+click toggles a photo into a multi-selection, Shift+click adds a range;
 * while anything is selected a plain click toggles too, and the bar above the
 * grid applies favorite / hide to all selected photos at once. The selection
 * itself lives in LibraryLayer so its Esc handler can clear it first.
 */
function DirectImages({
  folder,
  node,
  hasKids,
  selected,
  files,
  picked,
  setPicked,
}: {
  folder: FolderInfo;
  node: FolderNode;
  hasKids: boolean;
  selected: boolean;
  files: FolderFile[];
  picked: Set<string>;
  setPicked: (paths: Set<string>) => void;
}) {
  const [images, setImages] = useState<FolderFile[] | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const showNotice = useUiStore((s) => s.showNotice);
  const t = useT();

  useEffect(() => {
    let cancelled = false;
    setImages(null);
    setAnchor(null);
    api
      .listFolderFiles(folder.id, node.rel_path)
      .then((list) => !cancelled && setImages(list))
      .catch(() => !cancelled && setImages([]));
    return () => {
      cancelled = true;
    };
  }, [folder.id, node.rel_path, node.count]);

  const indexByPath = useMemo(() => new Map(files.map((f, i) => [f.path, i])), [files]);
  const list = images ?? [];
  const pickedFiles = list.filter((f) => picked.has(f.path));

  const patch = (results: { path: string; favorite: boolean; hidden: boolean }[]) => {
    const byPath = new Map(results.map((r) => [r.path, r]));
    setImages((cur) => cur && cur.map((x) => (byPath.has(x.path) ? { ...x, ...byPath.get(x.path) } : x)));
  };

  /** set favorite / hidden on some photos; shown right away, rolled back if the request fails */
  const apply = async (targets: FolderFile[], fields: Partial<ImageFlags>) => {
    if (targets.length === 0) return;
    const before = targets.map((f) => ({ path: f.path, favorite: f.favorite, hidden: f.hidden }));
    patch(targets.map((f) => ({ path: f.path, favorite: fields.favorite ?? f.favorite, hidden: fields.hidden ?? f.hidden })));
    setBusy(true);
    try {
      patch(await setImageFlags(targets, fields));
      if (fields.hidden !== undefined) showNotice(t(fields.hidden ? "library.hiddenNotice" : "library.unhiddenNotice"));
    } catch {
      patch(before);
    } finally {
      setBusy(false);
    }
  };

  const onTileClick = (e: React.MouseEvent | React.KeyboardEvent, f: FolderFile) => {
    if (e.shiftKey && anchor) {
      // range between the last clicked photo and this one, added to the selection
      const a = list.findIndex((x) => x.path === anchor);
      const b = list.findIndex((x) => x.path === f.path);
      const [from, to] = a <= b ? [a, b] : [b, a];
      setPicked(new Set([...picked, ...list.slice(from, to + 1).map((x) => x.path)]));
      return;
    }
    if (e.ctrlKey || e.metaKey || e.shiftKey || picked.size > 0) {
      const next = new Set(picked);
      if (next.has(f.path)) next.delete(f.path);
      else next.add(f.path);
      setPicked(next);
      setAnchor(f.path);
      return;
    }
    setAnchor(f.path);
    const index = indexByPath.get(f.path);
    if (f.hidden) showNotice(t("library.hiddenNotice"));
    else if (index !== undefined) openInBrowsing(index);
    else showNotice(t("library.onlyCheckedOpen"));
  };

  return (
    <>
      <SectionTitle lead={hasKids ? <SelectBox state={selected ? "all" : "none"} size={16} title={t("library.selectDirectOnly")} onClick={() => toggleFolderDirect(folder.id, node.rel_path)} /> : undefined}>
        {t("library.directImages", node.count, hasKids)}
      </SectionTitle>
      {picked.size > 0 ? (
        // compact toolbar, only as wide as its buttons: count | favorite | hide | select
        <div
          style={{
            position: "sticky",
            top: -10,
            zIndex: 2,
            width: "fit-content",
            maxWidth: "100%",
            display: "flex",
            alignItems: "center",
            gap: 2,
            margin: "0 0 10px",
            padding: 3,
            borderRadius: 10,
            background: "rgba(19,20,28,.94)",
            border: "1px solid var(--color-border-3)",
            boxShadow: "0 8px 24px rgba(0,0,0,.45)",
            backdropFilter: "blur(8px)",
            fontSize: 12,
          }}
        >
          <span style={{ padding: "0 10px 0 8px", fontWeight: 500, color: "var(--color-accent-200)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {t("library.pickedCount", picked.size)}
          </span>
          <BarDivider />
          <BulkButton icon="ph-fill ph-star" iconColor="#f2c94c" disabled={busy} title={t("library.favorite")} onClick={() => apply(pickedFiles, { favorite: true })}>
            {t("library.favorite")}
          </BulkButton>
          <BulkButton icon="ph ph-star" disabled={busy} title={t("library.unfavorite")} onClick={() => apply(pickedFiles, { favorite: false })}>
            {t("library.bulkUnfavorite")}
          </BulkButton>
          <BarDivider />
          <BulkButton icon="ph-fill ph-eye-slash" disabled={busy} title={t("library.hide")} onClick={() => apply(pickedFiles, { hidden: true })}>
            {t("library.bulkHide")}
          </BulkButton>
          <BulkButton icon="ph ph-eye" disabled={busy} title={t("library.unhide")} onClick={() => apply(pickedFiles, { hidden: false })}>
            {t("library.bulkUnhide")}
          </BulkButton>
          <BarDivider />
          <BulkButton icon="ph ph-checks" disabled={busy || picked.size === list.length} title={t("library.selectAll")} onClick={() => setPicked(new Set(list.map((f) => f.path)))} />
          <BulkButton icon="ph ph-x" title={`${t("library.deselect")} (Esc)`} onClick={() => setPicked(new Set())} />
        </div>
      ) : (
        list.length > 1 && <div style={{ margin: "-4px 0 10px", fontSize: 11, color: "var(--color-neutral-700)" }}>{t("library.multiSelectHint")}</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 8 }}>
        {list.map((f) => {
          const inSelection = indexByPath.has(f.path);
          const isPicked = picked.has(f.path);
          return (
            // a div, not a button: the tile holds the two toggle buttons
            <div
              key={f.path}
              role="button"
              tabIndex={0}
              aria-selected={isPicked}
              className="lib-img"
              title={f.hidden ? t("library.hiddenTitle", f.name) : inSelection ? f.name : t("library.notSelected", f.name)}
              onClick={(e) => onTileClick(e, f)}
              onMouseDown={(e) => e.shiftKey && e.preventDefault() /* no text selection on Shift+click */}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                onTileClick(e, f);
              }}
              style={{
                position: "relative",
                aspectRatio: "3/4",
                borderRadius: 6,
                overflow: "hidden",
                cursor: "pointer",
                background: "linear-gradient(160deg,#1c1d27,#101118)",
                border: "1px solid var(--color-divider)",
                boxShadow: isPicked ? "inset 0 0 0 2px var(--color-accent)" : undefined,
              }}
            >
              <img
                src={thumbUrl(folder.id, f.path)}
                loading="lazy"
                decoding="async"
                draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: f.hidden ? 0.25 : inSelection ? 1 : 0.4, transition: "opacity .15s" }}
              />
              {isPicked && <div style={{ position: "absolute", inset: 0, background: "color-mix(in srgb, var(--color-accent) 18%, transparent)", pointerEvents: "none" }} />}
              <ImageToggle
                icon="ph-star"
                active={f.favorite}
                activeColor="#f2c94c"
                title={f.favorite ? t("library.unfavorite") : t("library.favorite")}
                onClick={() => apply([f], { favorite: !f.favorite })}
                style={{ top: 5, left: 5 }}
              />
              {f.is_gif && (
                <span style={{ position: "absolute", top: 5, right: 5, fontSize: 9, letterSpacing: ".04em", padding: "2px 6px", borderRadius: 5, background: "var(--color-accent-800)", color: "var(--color-accent-100)", pointerEvents: "none" }}>GIF</span>
              )}
              {isPicked && (
                <span style={{ position: "absolute", left: 5, bottom: 5, width: 20, height: 20, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-accent)", color: "#14121f", pointerEvents: "none" }}>
                  <i className="ph-bold ph-check" style={{ fontSize: 12 }} />
                </span>
              )}
              <ImageToggle
                icon="ph-eye-slash"
                active={f.hidden}
                activeColor="var(--color-accent-300)"
                title={f.hidden ? t("library.unhide") : t("library.hide")}
                onClick={() => apply([f], { hidden: !f.hidden })}
                style={{ right: 5, bottom: 5 }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

function BulkButton({
  icon,
  iconColor,
  title,
  disabled,
  onClick,
  children,
}: {
  icon: string;
  iconColor?: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      className="btn btn-ghost"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{ flex: "none", height: 28, padding: children ? "0 9px" : 0, width: children ? undefined : 28, borderRadius: 7, fontSize: 12, gap: 5, whiteSpace: "nowrap" }}
    >
      <i className={icon} style={{ fontSize: 13, color: iconColor }} />
      {children}
    </button>
  );
}

function BarDivider() {
  return <span style={{ flex: "none", width: 1, height: 16, margin: "0 3px", background: "var(--color-border-3)" }} />;
}

/** small corner toggle on an image tile: shown on hover, and always while on */
function ImageToggle({
  icon,
  active,
  activeColor,
  title,
  onClick,
  style,
}: {
  icon: string;
  active: boolean;
  activeColor: string;
  title: string;
  onClick: () => void;
  style: React.CSSProperties;
}) {
  return (
    <button
      className={`lib-img-toggle${active ? " on" : ""}`}
      title={title}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        position: "absolute",
        width: 24,
        height: 24,
        padding: 0,
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(7,8,12,.72)",
        color: active ? activeColor : "var(--color-neutral-300)",
        ...style,
      }}
    >
      <i className={`${active ? "ph-fill" : "ph"} ${icon}`} style={{ fontSize: 13 }} />
    </button>
  );
}

export function SelectionChip({ folders, item }: { folders: FolderInfo[]; item: FolderSelectionItem }) {
  const { parent, name } = itemLabel(folders, item);
  const t = useT();
  return (
    <span
      title={item.recursive ? t("library.chipRecursive") : t("library.chipDirectOnly")}
      style={{
        flex: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 26,
        padding: "0 3px 0 9px",
        borderRadius: 6,
        background: "var(--color-accent-900)",
        border: "1px solid var(--color-accent-800)",
        color: "var(--color-accent-200)",
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {parent && <span style={{ color: "var(--color-accent-500)" }}>{parent} ›</span>}
      {name}
      {!item.recursive && <span style={{ color: "var(--color-accent-500)" }}>{t("library.chipThisOnly")}</span>}
      <button
        title={t("library.deselect")}
        onClick={() => removeSelectionItem(item)}
        style={{ width: 20, height: 20, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--color-accent-400)" }}
      >
        <i className="ph ph-x" style={{ fontSize: 11 }} />
      </button>
    </span>
  );
}

function Tray({ folders, items, selectedCount, canStart }: { folders: FolderInfo[]; items: FolderSelectionItem[]; selectedCount: number; canStart: boolean }) {
  const t = useT();
  return (
    <div
      style={{
        position: "absolute",
        left: 20,
        right: 20,
        bottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 10px 10px 16px",
        borderRadius: 14,
        background: "rgba(19,20,28,.94)",
        border: "1px solid var(--color-border-3)",
        boxShadow: "0 18px 50px rgba(0,0,0,.6)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ flex: "none", fontSize: 11.5, color: "var(--color-neutral-500)" }}>
        <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.15, color: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>{t("unit.images", selectedCount)}</div>
        {t("unit.folders", items.length)}
      </div>
      <div className="lib-chips" style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
        {items.length === 0 ? (
          <span style={{ alignSelf: "center", fontSize: 12, color: "var(--color-neutral-600)" }}>{t("library.trayHint")}</span>
        ) : (
          items.map((item) => <SelectionChip key={nodeKey(item.folder_id, item.rel_path) + (item.recursive ? "/*" : "")} folders={folders} item={item} />)
        )}
      </div>
      {items.length > 0 && (
        <button className="btn btn-ghost" onClick={clearSelection} style={{ flex: "none", height: 34, padding: "0 10px", fontSize: 12.5, color: "var(--color-neutral-400)" }}>
          {t("library.clearAll")}
        </button>
      )}
      <button
        className="btn btn-primary"
        onClick={startSession}
        disabled={!canStart}
        style={{ flex: "none", height: 36, padding: "0 16px", fontSize: 13, background: canStart ? "var(--color-accent)" : undefined, color: canStart ? "#14121f" : undefined }}
      >
        <i className="ph-fill ph-play" style={{ fontSize: 13 }} />
        {t("library.startWithThis")}
      </button>
    </div>
  );
}

function FirstRun() {
  const t = useT();
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--color-neutral-500)", textAlign: "center" }}>
      <i className="ph ph-folders" style={{ fontSize: 40, color: "var(--color-accent-700)" }} />
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text)" }}>{t("folders.emptyTitle")}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
        {t("library.firstRunLine1")}
        <br />
        {t("library.firstRunLine2")}
      </div>
      <button className="btn btn-primary" onClick={addFolderViaDialog} style={{ height: 36, padding: "0 16px", fontSize: 13 }}>
        <i className="ph ph-folder-simple-plus" style={{ fontSize: 15 }} />
        {t("folders.add")}
      </button>
    </div>
  );
}
