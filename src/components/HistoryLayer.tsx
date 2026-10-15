import { useCallback, useEffect, useState } from "react";
import { fileUrl, practiceThumbUrl } from "@/api/client";
import { copyImageToClipboard } from "@/lib/clipboard";
import { useHistoryStore } from "@/state/historyStore";
import { useUiStore } from "@/state/uiStore";
import { durLabel, formatDateLabel, formatTimeLabel } from "@/lib/format";
import type { HistoryEntry } from "@/types";
import { MenuList } from "./Menu";

const MENU_WIDTH = 180;

/** Stage overlay for a history session: image list (index null) or a single image. */
export function HistoryLayer() {
  const view = useUiStore((s) => s.historyView);
  const setHistoryView = useUiStore((s) => s.setHistoryView);
  const entry = useHistoryStore((s) => s.entries.find((e) => e.id === view?.entryId));

  const index = view?.index ?? null;
  const count = entry?.images.length ?? 0;
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => setMenu(null), [view?.entryId, index]);

  const copyImage = async (i: number) => {
    if (!entry) return;
    const img = entry.images[i];
    try {
      const used = await copyImageToClipboard([fileUrl(img.source_path), practiceThumbUrl(entry.id, img.order_index)]);
      setNotice(used === 0 ? "이미지를 클립보드에 복사했습니다" : "원본이 없어 썸네일을 복사했습니다");
    } catch {
      setNotice("이미지를 복사하지 못했습니다");
    }
  };

  useEffect(() => {
    if (!entry) return;
    const go = (i: number | null) => setHistoryView({ entryId: entry.id, index: i });
    // capture phase so the global shortcuts (Esc = stop session, ←/→ = photo nav) don't also fire
    const onKeyDown = (e: KeyboardEvent) => {
      if (menu) {
        if (e.key !== "Escape") return;
        setMenu(null);
      } else if (e.key === "Escape") {
        if (index !== null) go(null);
        else setHistoryView(null);
      } else if (e.key === "ArrowLeft" && index !== null) go(Math.max(0, index - 1));
      else if (e.key === "ArrowRight" && index !== null) go(Math.min(count - 1, index + 1));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [entry, index, count, menu, setHistoryView]);

  if (!view || !entry) return null;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 9, background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "14px 14px 12px 20px" }}>
        {index === null ? (
          <i className="ph ph-clock-counter-clockwise" style={{ fontSize: 18, color: "var(--color-accent)" }} />
        ) : (
          <button className="btn btn-ghost btn-icon" title="목록 (Esc)" onClick={() => setHistoryView({ entryId: entry.id, index: null })} style={{ width: 30, height: 30, marginLeft: -6 }}>
            <i className="ph ph-arrow-left" style={{ fontSize: 16 }} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>
            {formatDateLabel(entry.created_at)} <span style={{ fontWeight: 400, color: "var(--color-neutral-500)" }}>{formatTimeLabel(entry.created_at)}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>
            {entry.folder_name} · {durLabel(entry.duration_seconds)} × {entry.images_count}장 · {entry.minutes}분
          </div>
        </div>
        <button className="btn btn-ghost btn-icon" title="닫기" onClick={() => setHistoryView(null)} style={{ width: 30, height: 30 }}>
          <i className="ph ph-x" style={{ fontSize: 16 }} />
        </button>
      </div>

      {index === null ? (
        <ImageList entry={entry} onContextMenu={(x, y, i) => setMenu({ x, y, index: i })} />
      ) : (
        <ImageView entry={entry} index={index} />
      )}

      {menu && (
        <MenuList
          entries={[{ label: "이미지 복사", hint: "클립보드", onClick: () => copyImage(menu.index) }]}
          onClose={closeMenu}
          width={MENU_WIDTH}
          style={{ left: Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8), top: Math.min(menu.y, window.innerHeight - 56) }}
        />
      )}
      {notice && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 20,
            transform: "translateX(-50%)",
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 12,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-3)",
            boxShadow: "0 10px 30px rgba(0,0,0,.6)",
            pointerEvents: "none",
          }}
        >
          {notice}
        </div>
      )}
    </div>
  );
}

function ImageList({ entry, onContextMenu }: { entry: HistoryEntry; onContextMenu: (x: number, y: number, index: number) => void }) {
  const setHistoryView = useUiStore((s) => s.setHistoryView);

  if (entry.images.length === 0) {
    return <div style={{ color: "var(--color-neutral-700)", fontSize: 12.5, padding: "20px" }}>이 기록에는 저장된 이미지가 없습니다.</div>;
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
      {entry.images.map((img, i) => (
        <button
          key={img.order_index}
          className="history-row"
          onClick={() => setHistoryView({ entryId: entry.id, index: i })}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu(e.clientX, e.clientY, i);
          }}
          style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 8px", borderRadius: 6, textAlign: "left", color: "var(--color-text)" }}
        >
          <span style={{ width: 22, flex: "none", fontSize: 11, color: "var(--color-neutral-600)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{i + 1}</span>
          <div style={{ width: 56, height: 56, flex: "none", borderRadius: 5, overflow: "hidden", background: "var(--color-surface-2)", border: "1px solid var(--color-divider)" }}>
            <img src={practiceThumbUrl(entry.id, img.order_index)} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{img.rel_path.split("/").pop()}</div>
            <div style={{ fontSize: 11, color: "var(--color-neutral-600)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{img.source_path}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function ImageView({ entry, index }: { entry: HistoryEntry; index: number }) {
  const setHistoryView = useUiStore((s) => s.setHistoryView);
  const img = entry.images[index];
  const [missing, setMissing] = useState(false);

  useEffect(() => setMissing(false), [entry.id, index]);

  if (!img) return null;
  const go = (i: number) => setHistoryView({ entryId: entry.id, index: i });

  return (
    <>
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
        <img
          key={`${entry.id}-${img.order_index}`}
          src={missing ? practiceThumbUrl(entry.id, img.order_index) : fileUrl(img.source_path)}
          onError={() => setMissing(true)}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
        />
      </div>
      <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "12px 20px 16px", fontSize: 12, color: "var(--color-neutral-500)" }}>
        <button className="btn btn-ghost btn-icon" title="이전 (←)" disabled={index === 0} onClick={() => go(index - 1)} style={{ width: 30, height: 30 }}>
          <i className="ph ph-caret-left" style={{ fontSize: 15 }} />
        </button>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {index + 1} / {entry.images.length}
        </span>
        <span style={{ minWidth: 0, maxWidth: 420, color: "var(--color-neutral-700)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.rel_path}</span>
        {missing && <span style={{ flex: "none", color: "var(--color-neutral-700)" }}>· 원본을 찾을 수 없어 썸네일로 표시</span>}
        <button className="btn btn-ghost btn-icon" title="다음 (→)" disabled={index === entry.images.length - 1} onClick={() => go(index + 1)} style={{ width: 30, height: 30 }}>
          <i className="ph ph-caret-right" style={{ fontSize: 15 }} />
        </button>
      </div>
    </>
  );
}
