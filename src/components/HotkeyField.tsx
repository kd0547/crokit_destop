import { useEffect, useState } from "react";
import { setHotkeyCapturing } from "@/hooks/useFlipHotkey";
import type { Hotkey } from "@/types";

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "OS", "AltGraph", "CapsLock", "NumLock", "ScrollLock"]);

function keyName(e: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  if (e.code.startsWith("Numpad")) return "Num" + e.code.slice(6);
  if (e.key === " ") return "Space";
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

function toHotkey(e: KeyboardEvent): Hotkey {
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean);
  return {
    // Chromium on Windows reports the Windows virtual-key code here, which is what the backend hook matches
    vk: e.keyCode,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    label: [...mods, keyName(e)].join("+"),
  };
}

/** Click, then press a key (optionally with Ctrl/Alt/Shift) to record it. Esc cancels. */
export function HotkeyField({ value, onChange }: { value: Hotkey | null; onChange: (hk: Hotkey | null) => void }) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    setHotkeyCapturing(true);
    // capture phase on window runs before the app shortcuts and the menu's Escape handler
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(false);
        return;
      }
      // 229 = IME composition (Korean input mode), no usable key code
      if (MODIFIER_KEYS.has(e.key) || e.keyCode === 229 || e.metaKey) return;
      onChange(toHotkey(e));
      setCapturing(false);
    };
    const onBlur = () => setCapturing(false);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
      setHotkeyCapturing(false);
    };
  }, [capturing, onChange]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        onClick={() => setCapturing((v) => !v)}
        title={capturing ? "등록할 키를 누르세요 (Esc 취소)" : "클릭한 뒤 키를 누르면 등록됩니다"}
        style={{
          minWidth: 76,
          height: 24,
          padding: "0 8px",
          borderRadius: 6,
          font: "500 11px var(--font-body)",
          border: `1px solid ${capturing ? "var(--color-accent)" : "var(--color-border-strong)"}`,
          background: capturing ? "var(--color-accent-900)" : "var(--color-surface-2)",
          color: capturing ? "var(--color-accent-300)" : value ? "var(--color-text)" : "var(--color-neutral-600)",
        }}
      >
        {capturing ? "키 입력…" : value?.label ?? "없음"}
      </button>
      {value && !capturing && (
        <button
          onClick={() => onChange(null)}
          title="단축키 지우기"
          style={{ width: 20, height: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-neutral-600)" }}
        >
          <i className="ph ph-x" style={{ fontSize: 11 }} />
        </button>
      )}
    </div>
  );
}
