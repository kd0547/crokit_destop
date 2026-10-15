import { useState } from "react";
import { practiceThumbUrl } from "@/api/client";
import { useUiStore } from "@/state/uiStore";
import type { HistoryEntry } from "@/types";

const COLLAPSED_COUNT = 10;

export function HistoryImages({ entry }: { entry: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const historyView = useUiStore((s) => s.historyView);
  const setHistoryView = useUiStore((s) => s.setHistoryView);

  const images = entry.images;
  if (images.length === 0) return null;

  const overflow = images.length - COLLAPSED_COUNT;
  const shown = expanded || overflow <= 1 ? images : images.slice(0, COLLAPSED_COUNT - 1);
  const activeIndex = historyView?.entryId === entry.id ? historyView.index : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginTop: 4 }}>
      {shown.map((img, i) => (
        <button
          key={img.order_index}
          title={img.rel_path}
          onClick={() => setHistoryView({ entryId: entry.id, index: i })}
          style={{
            aspectRatio: "1",
            padding: 0,
            borderRadius: 4,
            overflow: "hidden",
            background: "var(--color-surface-2)",
            border: `1px solid ${activeIndex === i ? "var(--color-accent-500)" : "var(--color-border-2)"}`,
          }}
        >
          <img
            src={practiceThumbUrl(entry.id, img.order_index)}
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </button>
      ))}
      {overflow > 1 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            aspectRatio: "1",
            borderRadius: 4,
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border-2)",
            color: "var(--color-neutral-500)",
            font: "500 11px var(--font-body)",
          }}
        >
          {expanded ? <i className="ph ph-caret-up" style={{ fontSize: 13 }} /> : `+${overflow + 1}`}
        </button>
      )}
    </div>
  );
}
