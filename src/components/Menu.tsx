import { useEffect, useRef, type ReactNode } from "react";

export interface MenuAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
}

export type MenuEntry = MenuAction | "separator" | { custom: ReactNode };

export function MenuList({
  entries,
  onClose,
  width = 220,
  style,
}: {
  entries: MenuEntry[];
  onClose: () => void;
  width?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="no-drag"
      style={{
        position: "fixed",
        zIndex: 1000,
        width,
        padding: 6,
        borderRadius: "var(--radius-md)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border-3)",
        boxShadow: "0 16px 40px rgba(0,0,0,.65)",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {entries.map((entry, i) => {
        if (entry === "separator") {
          return <div key={i} style={{ height: 1, margin: "5px 8px", background: "var(--color-divider)" }} />;
        }
        if ("custom" in entry) {
          return <div key={i}>{entry.custom}</div>;
        }
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button
              onClick={() => {
                if (entry.disabled) return;
                entry.onClick();
                onClose();
              }}
              disabled={entry.disabled}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 30,
                padding: "0 10px",
                borderRadius: 6,
                color: "var(--color-text)",
                opacity: entry.disabled ? 0.4 : 1,
                cursor: entry.disabled ? "default" : "pointer",
                textAlign: "left",
                font: "400 12px var(--font-body)",
              }}
              onMouseEnter={(e) => {
                if (!entry.disabled) e.currentTarget.style.background = "#171822";
              }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {entry.icon !== undefined ? (
                <span style={{ width: 14, display: "flex", color: "var(--color-accent)", opacity: entry.checked ? 1 : 0 }}>{entry.icon}</span>
              ) : (
                <i className="ph ph-check" style={{ width: 14, fontSize: 13, color: "var(--color-accent)", opacity: entry.checked ? 1 : 0 }} />
              )}
              <span style={{ flex: 1 }}>{entry.label}</span>
              {entry.hint && <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{entry.hint}</span>}
            </button>
            {entry.trailing}
          </div>
        );
      })}
    </div>
  );
}
