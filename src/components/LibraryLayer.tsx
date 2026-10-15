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
  startSession,
  toggleFolderDirect,
  toggleFolderSelection,
} from "@/state/actions";
import { allNodeRefs, expandSelection, findNode, itemLabel, nodeKey, nodeTrail, selectedTotals, stateOf, type SelectState } from "@/lib/folderTree";
import type { FolderFile, FolderInfo, FolderNode, FolderSelectionItem } from "@/types";

const CARD_SIZES = { small: 168, large: 236 } as const;
type CardSize = keyof typeof CARD_SIZES;
const SEARCH_LIMIT = 120;

/**
 * Stage overlay for picking practice folders: registered folders and their
 * subfolders as cover cards. Clicking a card opens it, its checkbox selects it
 * (with all subfolders). Selected folders gather in the tray at the bottom.
 */
export function LibraryLayer() {
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

  const keys = useMemo(() => expandSelection(folders, items), [folders, items]);
  const totals = useMemo(() => selectedTotals(folders, keys), [folders, keys]);
  const selectedCount = folders.reduce((sum, f) => sum + (totals.get(nodeKey(f.id, "")) ?? 0), 0);

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
        if (query) setQuery("");
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
        <SectionTitle>{`'${query}' 검색 결과 ${hits.length}`}</SectionTitle>
        {hits.length === 0 ? (
          <Empty>일치하는 폴더가 없습니다</Empty>
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
        <Heading title="라이브러리" meta={`등록한 폴더 ${folders.length}개 · 전체 ${folders.reduce((s, f) => s + f.count, 0)}장`} />
        <SectionTitle>등록된 폴더</SectionTitle>
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
              폴더 등록
              <span style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>또는 창에 폴더를 끌어다 놓기</span>
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
          meta={`${absPath} · ${hasKids ? `하위 포함 ${node.total}장 · 하위 폴더 ${node.children.length}개` : `${node.total}장`}`}
          action={
            <button
              className={`btn ${state === "all" ? "btn-ghost" : "btn-primary"}`}
              onClick={() => toggleFolderSelection(folder.id, node.rel_path)}
              disabled={node.total === 0}
              style={{ flex: "none", height: 34, padding: "0 14px", fontSize: 13 }}
            >
              <i className={`ph ${state === "all" ? "ph-check-square" : "ph-plus-square"}`} style={{ fontSize: 15 }} />
              {state === "all" ? "선택됨 · 해제" : hasKids ? "이 폴더 전체 선택 (하위 포함)" : "이 폴더 선택"}
            </button>
          }
        />
        {hasKids && (
          <>
            <SectionTitle>{`하위 폴더 ${node.children.length}`}</SectionTitle>
            <div style={grid}>
              {node.children.map((c) => (
                <FolderCard key={c.rel_path} folder={folder} node={c} state={stateOf(folder.id, c, totals)} onOpen={() => open(folder, c)} />
              ))}
            </div>
          </>
        )}
        {node.count > 0 && <DirectImages folder={folder} node={node} hasKids={hasKids} selected={keys.has(nodeKey(folder.id, node.rel_path))} files={files} />}
        {node.total === 0 && <Empty>이 폴더에는 이미지가 없습니다</Empty>}
      </>
    );
  }

  const trail = folder && node ? nodeTrail(folder, node.rel_path) : [];

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 8, background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 10px 14px", borderBottom: "1px solid var(--color-border)" }}>
        <button className="btn btn-ghost btn-icon" title="상위 폴더 (Backspace)" onClick={goUp} disabled={!folder || !!query} style={{ flex: "none", width: 30, height: 30 }}>
          <i className="ph ph-arrow-up" style={{ fontSize: 15 }} />
        </button>
        <nav style={{ flex: "0 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 2, overflow: "hidden", fontSize: 13 }}>
          <Crumb current={!folder} onClick={() => go(null)}>
            <i className="ph ph-books" style={{ fontSize: 14 }} />
            라이브러리
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
            placeholder="모든 폴더에서 검색"
            style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 12.5 }}
          />
        </label>
        <button className="btn btn-ghost btn-icon" title="폴더 다시 읽기" onClick={rescan} disabled={scanning} style={{ flex: "none", width: 30, height: 30 }}>
          <i className="ph ph-arrows-clockwise" style={{ fontSize: 15 }} />
        </button>
        <div style={{ flex: "none", display: "flex", gap: 2, padding: 2, borderRadius: "var(--radius-md)", background: "var(--color-surface-2)", border: "1px solid var(--color-border-2)" }}>
          {(["small", "large"] as const).map((size) => (
            <button
              key={size}
              title={size === "small" ? "작게" : "크게"}
              onClick={() => setCardSize(size)}
              style={{ width: 28, height: 24, borderRadius: 6, background: cardSize === size ? "var(--color-border-3)" : "transparent", color: cardSize === size ? "var(--color-text)" : "var(--color-neutral-600)" }}
            >
              <i className={`ph ${size === "small" ? "ph-dots-nine" : "ph-squares-four"}`} style={{ fontSize: 14 }} />
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-icon" title="닫기 (Esc)" onClick={() => setBrowsing(false)} style={{ flex: "none", width: 30, height: 30 }}>
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
  const samples = node.samples;
  const parent = crumb ? nodeTrail(folder, node.rel_path).slice(0, -1).map((n) => n.name).join(" › ") : "";
  const mosaic: React.CSSProperties =
    samples.length >= 3
      ? { gridTemplateColumns: "2fr 1fr", gridTemplateRows: "1fr 1fr" }
      : samples.length === 2
        ? { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr" }
        : { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" };

  return (
    <div className="lib-card" onClick={onOpen} title={`${node.name} 열기`} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8, cursor: "pointer", minWidth: 0 }}>
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
            하위 {node.children.length}
          </Badge>
        )}
        <Badge className="lib-hover" style={{ right: 8, bottom: 8 }}>
          열기
          <i className="ph ph-arrow-right" style={{ fontSize: 12 }} />
        </Badge>
        {onRemove && (
          <button
            className="lib-hover"
            title="목록에서 삭제 (실제 파일은 그대로)"
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
        <SelectBox state={state} size={22} title={node.children.length ? "선택 (하위 폴더 포함)" : "선택"} onClick={() => node.total > 0 && toggleFolderSelection(folder.id, node.rel_path)} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 2px", minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <Highlight text={node.name} query={query} />
          </div>
          {crumb && parent && <div style={{ fontSize: 11, color: "var(--color-neutral-700)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{parent}</div>}
        </div>
        <span style={{ flex: "none", fontSize: 11, fontVariantNumeric: "tabular-nums", color: state === "all" ? "var(--color-accent-400)" : "var(--color-neutral-600)" }}>{node.total}장</span>
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

/** images directly inside the open folder; ones outside the current selection are dimmed */
function DirectImages({ folder, node, hasKids, selected, files }: { folder: FolderInfo; node: FolderNode; hasKids: boolean; selected: boolean; files: FolderFile[] }) {
  const [images, setImages] = useState<FolderFile[] | null>(null);
  const showNotice = useUiStore((s) => s.showNotice);

  useEffect(() => {
    let cancelled = false;
    setImages(null);
    api
      .listFolderFiles(folder.id, node.rel_path)
      .then((list) => !cancelled && setImages(list))
      .catch(() => !cancelled && setImages([]));
    return () => {
      cancelled = true;
    };
  }, [folder.id, node.rel_path, node.count]);

  const indexByPath = useMemo(() => new Map(files.map((f, i) => [f.path, i])), [files]);

  return (
    <>
      <SectionTitle lead={hasKids ? <SelectBox state={selected ? "all" : "none"} size={16} title="이 폴더 이미지만 선택" onClick={() => toggleFolderDirect(folder.id, node.rel_path)} /> : undefined}>
        {`이 폴더의 이미지 ${node.count}장${hasKids ? " · 하위 폴더 제외" : ""}`}
      </SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 8 }}>
        {(images ?? []).map((f) => {
          const index = indexByPath.get(f.path);
          const inSelection = index !== undefined;
          return (
            <button
              key={f.path}
              className="lib-img"
              title={inSelection ? f.name : `${f.name} · 선택하지 않은 폴더`}
              onClick={() => (inSelection ? openInBrowsing(index) : showNotice("체크한 폴더의 이미지만 열 수 있어요"))}
              style={{
                position: "relative",
                padding: 0,
                aspectRatio: "3/4",
                borderRadius: 6,
                overflow: "hidden",
                background: "linear-gradient(160deg,#1c1d27,#101118)",
                border: "1px solid var(--color-divider)",
                opacity: inSelection ? 1 : 0.4,
                transition: "opacity .15s",
              }}
            >
              <img src={thumbUrl(folder.id, f.path)} loading="lazy" decoding="async" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              {f.is_gif && (
                <span style={{ position: "absolute", top: 5, left: 5, fontSize: 9, letterSpacing: ".04em", padding: "2px 6px", borderRadius: 5, background: "var(--color-accent-800)", color: "var(--color-accent-100)" }}>GIF</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function SelectionChip({ folders, item }: { folders: FolderInfo[]; item: FolderSelectionItem }) {
  const { parent, name } = itemLabel(folders, item);
  return (
    <span
      title={item.recursive ? "하위 폴더 포함" : "이 폴더 이미지만"}
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
      {!item.recursive && <span style={{ color: "var(--color-accent-500)" }}>(이 폴더만)</span>}
      <button
        title="선택 해제"
        onClick={() => removeSelectionItem(item)}
        style={{ width: 20, height: 20, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--color-accent-400)" }}
      >
        <i className="ph ph-x" style={{ fontSize: 11 }} />
      </button>
    </span>
  );
}

function Tray({ folders, items, selectedCount, canStart }: { folders: FolderInfo[]; items: FolderSelectionItem[]; selectedCount: number; canStart: boolean }) {
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
        <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.15, color: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>{selectedCount}장</div>
        {items.length}개 폴더
      </div>
      <div className="lib-chips" style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
        {items.length === 0 ? (
          <span style={{ alignSelf: "center", fontSize: 12, color: "var(--color-neutral-600)" }}>폴더 카드의 체크박스로 연습할 폴더를 고르세요</span>
        ) : (
          items.map((item) => <SelectionChip key={nodeKey(item.folder_id, item.rel_path) + (item.recursive ? "/*" : "")} folders={folders} item={item} />)
        )}
      </div>
      {items.length > 0 && (
        <button className="btn btn-ghost" onClick={clearSelection} style={{ flex: "none", height: 34, padding: "0 10px", fontSize: 12.5, color: "var(--color-neutral-400)" }}>
          모두 해제
        </button>
      )}
      <button
        className="btn btn-primary"
        onClick={startSession}
        disabled={!canStart}
        style={{ flex: "none", height: 36, padding: "0 16px", fontSize: 13, background: canStart ? "var(--color-accent)" : undefined, color: canStart ? "#14121f" : undefined }}
      >
        <i className="ph-fill ph-play" style={{ fontSize: 13 }} />
        이 구성으로 시작
      </button>
    </div>
  );
}

function FirstRun() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--color-neutral-500)", textAlign: "center" }}>
      <i className="ph ph-folders" style={{ fontSize: 40, color: "var(--color-accent-700)" }} />
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text)" }}>레퍼런스 사진 폴더를 등록하세요</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
        하위 폴더까지 모두 읽어 옵니다. 등록한 뒤 연습할 폴더만 골라 섞을 수 있어요.
        <br />
        폴더를 이 창에 끌어다 놓아도 됩니다.
      </div>
      <button className="btn btn-primary" onClick={addFolderViaDialog} style={{ height: 36, padding: "0 16px", fontSize: 13 }}>
        <i className="ph ph-folder-simple-plus" style={{ fontSize: 15 }} />
        폴더 등록
      </button>
    </div>
  );
}
