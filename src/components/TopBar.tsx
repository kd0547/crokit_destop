import { useEffect, useRef, useState } from "react";
import { MenuList, type MenuEntry } from "./Menu";
import { ColorPicker } from "./ColorPicker";
import { HotkeyField } from "./HotkeyField";
import { useSettingsStore } from "@/state/settingsStore";
import { useSessionStore } from "@/state/sessionStore";
import { useUiStore } from "@/state/uiStore";
import { toggleAlwaysOnTop, toggleSetting, togglePanel, previewGridStyle, commitGridStyle, previewGridDivisions, commitGridDivisions, setFlipHotkey } from "@/state/actions";
import type { Settings } from "@/types";

interface MenuDef {
  key: string;
  label: string;
  entries: MenuEntry[];
  width?: number;
}

const GRID_PANEL_W = 232;

function GridSettingsControl({ settings }: { settings: Settings }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        className="no-drag"
        title="그리드 사용자 설정"
        onClick={(e) => {
          e.stopPropagation();
          if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            const left = Math.min(rect.right + 8, window.innerWidth - GRID_PANEL_W - 8);
            setPos({ left, top: rect.top });
          }
          setOpen((v) => !v);
        }}
        style={{
          width: 26,
          height: 26,
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          color: open ? "var(--color-accent)" : "var(--color-neutral-500)",
          background: open ? "#171822" : "transparent",
        }}
      >
        <i className="ph ph-gear-six" style={{ fontSize: 13 }} />
      </button>
      {open && (
        <div
          ref={panelRef}
          className="no-drag"
          style={{
            position: "fixed",
            left: pos.left,
            top: pos.top,
            zIndex: 1001,
            width: GRID_PANEL_W,
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-3)",
            boxShadow: "0 16px 40px rgba(0,0,0,.65)",
          }}
        >
          <ColorPicker
            hex={settings.grid_color}
            opacity={settings.grid_opacity}
            divisions={settings.grid_divisions}
            onPreview={previewGridStyle}
            onCommit={commitGridStyle}
            onDivisionsPreview={previewGridDivisions}
            onDivisionsCommit={commitGridDivisions}
          />
        </div>
      )}
    </>
  );
}

function FlipHotkeyRow({ value }: { value: Settings["flip_hotkey"] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 30, padding: "4px 6px 4px 10px" }}>
      <i className="ph ph-keyboard" style={{ width: 14, fontSize: 13, color: "var(--color-neutral-500)" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ font: "400 12px var(--font-body)", color: "var(--color-text)" }}>좌우 반전 단축키</span>
        <span style={{ fontSize: 10, color: "var(--color-neutral-600)" }}>다른 프로그램 사용 중에도 동작</span>
      </div>
      <HotkeyField value={value} onChange={setFlipHotkey} />
    </div>
  );
}

function TopMenuButton({ def, anyOpen }: { def: MenuDef; anyOpen: boolean }) {
  const menuOpen = useUiStore((s) => s.menuOpen);
  const setMenuOpen = useUiStore((s) => s.setMenuOpen);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const open = menuOpen === def.key;

  const place = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ left: rect.left, top: rect.bottom + 6 });
    }
  };

  return (
    <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center" }}>
      <button
        ref={btnRef}
        className="no-drag"
        onClick={() => {
          place();
          setMenuOpen(open ? null : def.key);
        }}
        onMouseEnter={() => {
          if (anyOpen && !open) {
            place();
            setMenuOpen(def.key);
          }
        }}
        style={{
          height: 26,
          padding: "0 10px",
          borderRadius: 6,
          font: "400 12px var(--font-body)",
          background: open ? "#171822" : "transparent",
          color: open ? "var(--color-text)" : "var(--color-neutral-400)",
        }}
      >
        {def.label}
      </button>
      {open && <MenuList entries={def.entries} onClose={() => setMenuOpen(null)} width={def.width ?? 220} style={pos} />}
    </div>
  );
}

export function TopBar() {
  const { settings } = useSettingsStore();
  const snapshot = useSessionStore((s) => s.snapshot);
  const menuOpen = useUiStore((s) => s.menuOpen);
  const browsing = useUiStore((s) => s.browsing);
  const setBrowsing = useUiStore((s) => s.setBrowsing);

  const showBack = snapshot.state === "idle" && !browsing;
  const windowTitle =
    snapshot.state !== "idle"
      ? `${snapshot.folderName} — ${snapshot.shownCount}${snapshot.totalCount ? " / " + snapshot.totalCount : ""}`
      : "크로키";

  const menus: MenuDef[] = [
    {
      key: "file",
      label: "파일",
      entries: [{ label: "종료", hint: "Alt+F4", onClick: () => window.crokit.window.close() }],
    },
    {
      key: "view",
      label: "보기",
      entries: [
        { label: "왼쪽 패널", hint: "[", checked: !!settings?.panel_open, onClick: () => togglePanel() },
        { label: "전체화면", hint: "F11", onClick: () => window.crokit.window.toggleFullscreen() },
        { label: "항상 위에 표시", checked: !!settings?.always_on_top, onClick: () => toggleAlwaysOnTop() },
      ],
    },
    {
      key: "image",
      label: "이미지",
      entries: [
        { label: "흑백", hint: "G", checked: !!settings?.gray, onClick: () => toggleSetting("gray") },
        { label: "좌우 반전", hint: "H", checked: !!settings?.flip, onClick: () => toggleSetting("flip") },
        {
          label: "그리드 사용자 설정",
          hint: "#",
          checked: !!settings?.grid,
          onClick: () => toggleSetting("grid"),
          trailing: settings ? <GridSettingsControl settings={settings} /> : undefined,
        },
      ],
    },
    {
      key: "settings",
      label: "설정",
      width: 260,
      entries: [
        { label: "시작 시 패널 숨기기", checked: !!settings?.auto_hide, onClick: () => toggleSetting("auto_hide") },
        { label: "타이머 소리", checked: !!settings?.sound, onClick: () => toggleSetting("sound") },
        { label: "관찰 시간 사용", checked: !!settings?.observe_enabled, onClick: () => toggleSetting("observe_enabled") },
        { label: "휴식 간격 사용", checked: !!settings?.breaks_enabled, onClick: () => toggleSetting("breaks_enabled") },
        "separator",
        { custom: <FlipHotkeyRow value={settings?.flip_hotkey ?? null} /> },
      ],
    },
  ];

  return (
    <div
      className="drag-region"
      style={{
        height: 34,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 0 0 6px",
        background: "var(--color-bg)",
        borderBottom: "1px solid var(--color-border)",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 1, height: "100%", position: "relative", zIndex: 30 }}>
        {!settings?.panel_open && (
          <button
            className="btn btn-ghost btn-icon no-drag"
            title="패널 열기 ( [ )"
            onClick={() => togglePanel()}
            style={{ width: 26, height: 26, marginRight: 4, color: "var(--color-neutral-400)" }}
          >
            <i className="ph ph-sidebar-simple" style={{ fontSize: 15 }} />
          </button>
        )}
        {menus.map((m) => (
          <TopMenuButton key={m.key} def={m} anyOpen={menuOpen !== null} />
        ))}
      </div>

      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 12, color: "var(--color-neutral-600)", pointerEvents: "none" }}>
        {windowTitle}
      </div>

      <div style={{ flex: 1 }} />

      {showBack && (
        <button
          className="btn btn-ghost no-drag"
          onClick={() => setBrowsing(true)}
          title="폴더 라이브러리"
          style={{ height: 24, padding: "0 8px", gap: 5, fontSize: 12, marginRight: 6, color: "var(--color-neutral-400)" }}
        >
          <i className="ph ph-squares-four" style={{ fontSize: 13 }} />
          라이브러리
        </button>
      )}

      <div style={{ width: 184, height: "100%", display: "flex", justifyContent: "flex-end" }}>
        <WindowButton
          icon={settings?.always_on_top ? "ph-fill ph-push-pin" : "ph ph-push-pin"}
          title={settings?.always_on_top ? "항상 위 해제" : "항상 위에 표시"}
          active={!!settings?.always_on_top}
          onClick={() => toggleAlwaysOnTop()}
        />
        <WindowButton icon="ph-minus" title="최소화" onClick={() => window.crokit.window.minimize()} />
        <WindowButton icon="ph-corners-out" title="전체화면" onClick={() => window.crokit.window.toggleFullscreen()} />
        <WindowButton icon="ph-x" title="닫기" danger onClick={() => window.crokit.window.close()} />
      </div>
    </div>
  );
}

function WindowButton({ icon, title, onClick, danger, active }: { icon: string; title: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  const restColor = active ? "var(--color-accent)" : "var(--color-neutral-500)";
  return (
    <button
      className="no-drag"
      title={title}
      onClick={onClick}
      style={{
        width: 46,
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: restColor,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? "var(--color-accent-800)" : "#15161d";
        e.currentTarget.style.color = danger ? "var(--color-accent-100)" : active ? "var(--color-accent)" : "var(--color-text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = restColor;
      }}
    >
      <i className={icon.includes(" ") ? icon : `ph ${icon}`} style={{ fontSize: 14 }} />
    </button>
  );
}
