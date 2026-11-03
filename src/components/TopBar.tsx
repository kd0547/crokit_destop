import { useEffect, useRef, useState } from "react";
import { MenuList, type MenuEntry } from "./Menu";
import { ColorPicker } from "./ColorPicker";
import { HotkeyField } from "./HotkeyField";
import { useSettingsStore } from "@/state/settingsStore";
import { useSessionStore } from "@/state/sessionStore";
import { useUiStore } from "@/state/uiStore";
import { toggleAlwaysOnTop, toggleSetting, togglePanel, previewGridStyle, commitGridStyle, previewGridDivisions, commitGridDivisions, setFlipHotkey, setLanguage } from "@/state/actions";
import { LANGUAGES, systemLocale, useT } from "@/i18n";
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
  const t = useT();

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
        title={t("grid.custom")}
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
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 30, padding: "4px 6px 4px 10px" }}>
      <i className="ph ph-keyboard" style={{ width: 14, fontSize: 13, color: "var(--color-neutral-500)" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ font: "400 12px var(--font-body)", color: "var(--color-text)" }}>{t("hotkey.flip")}</span>
        <span style={{ fontSize: 10, color: "var(--color-neutral-600)" }}>{t("hotkey.flipHint")}</span>
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
        className="no-drag top-menu-button"
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
  const [compact, setCompact] = useState(() => window.innerWidth < 480);
  const setMenuOpen = useUiStore((s) => s.setMenuOpen);
  useEffect(() => {
    const query = window.matchMedia("(width < 480px)");
    const update = () => {
      setCompact(query.matches);
      setMenuOpen(null);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [setMenuOpen]);
  const { settings } = useSettingsStore();
  const snapshot = useSessionStore((s) => s.snapshot);
  const menuOpen = useUiStore((s) => s.menuOpen);
  const browsing = useUiStore((s) => s.browsing);
  const setBrowsing = useUiStore((s) => s.setBrowsing);
  const t = useT();
  const language = settings?.language ?? "system";
  const systemLanguageName = LANGUAGES.find((l) => l.id === systemLocale())?.name ?? "";

  const showBack = snapshot.state === "idle" && !browsing;
  const windowTitle =
    snapshot.state !== "idle"
      ? `${snapshot.folderName} — ${snapshot.shownCount}${snapshot.totalCount ? " / " + snapshot.totalCount : ""}`
      : t("app.name");

  const menus: MenuDef[] = [
    {
      key: "file",
      label: t("menu.file"),
      entries: [{ label: t("menu.quit"), hint: "Alt+F4", onClick: () => window.crokit.window.close() }],
    },
    {
      key: "view",
      label: t("menu.view"),
      entries: [
        { label: t("menu.leftPanel"), hint: "[", checked: !!settings?.panel_open, onClick: () => togglePanel() },
        { label: t("menu.fullscreen"), hint: "F11", onClick: () => window.crokit.window.toggleFullscreen() },
        { label: t("menu.alwaysOnTop"), checked: !!settings?.always_on_top, onClick: () => toggleAlwaysOnTop() },
      ],
    },
    {
      key: "image",
      label: t("menu.image"),
      entries: [
        { label: t("menu.gray"), hint: "G", checked: !!settings?.gray, onClick: () => toggleSetting("gray") },
        { label: t("menu.flip"), hint: "H", checked: !!settings?.flip, onClick: () => toggleSetting("flip") },
        {
          label: t("grid.custom"),
          hint: "#",
          checked: !!settings?.grid,
          onClick: () => toggleSetting("grid"),
          trailing: settings ? <GridSettingsControl settings={settings} /> : undefined,
        },
      ],
    },
    {
      key: "settings",
      label: t("menu.settings"),
      width: 260,
      entries: [
        { label: t("menu.autoHide"), checked: !!settings?.auto_hide, onClick: () => toggleSetting("auto_hide") },
        { label: t("menu.sound"), checked: !!settings?.sound, onClick: () => toggleSetting("sound") },
        { label: t("menu.observe"), checked: !!settings?.observe_enabled, onClick: () => toggleSetting("observe_enabled") },
        { label: t("menu.breaks"), checked: !!settings?.breaks_enabled, onClick: () => toggleSetting("breaks_enabled") },
        "separator",
        { custom: <FlipHotkeyRow value={settings?.flip_hotkey ?? null} /> },
        "separator",
        { custom: <MenuHeading icon="ph-translate">{t("menu.language")}</MenuHeading> },
        { label: `${t("menu.languageSystem")} · ${systemLanguageName}`, checked: language === "system", onClick: () => setLanguage("system") },
        ...LANGUAGES.map((l) => ({ label: l.name, checked: language === l.id, onClick: () => setLanguage(l.id) })),
      ],
    },
  ];

  return (
    <div
      className="drag-region topbar"
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
      <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 1, height: "100%", position: "relative", zIndex: 30 }}>
        {!compact && !settings?.panel_open && (
          <button
            className="btn btn-ghost btn-icon no-drag"
            title={t("topbar.openPanel")}
            onClick={() => togglePanel()}
            style={{ width: 26, height: 26, marginRight: 4, color: "var(--color-neutral-400)" }}
          >
            <i className="ph ph-sidebar-simple" style={{ fontSize: 15 }} />
          </button>
        )}
        {compact ? (
          <>
            <button
              className="btn btn-ghost btn-icon no-drag"
              title={t("topbar.menu")}
              aria-label={t("topbar.menu")}
              aria-haspopup="menu"
              aria-expanded={menuOpen === "compact"}
              onClick={() => setMenuOpen(menuOpen === "compact" ? null : "compact")}
              style={{ width: 30, height: 26 }}
            >
              <i className="ph ph-list" style={{ fontSize: 19 }} />
            </button>
            {menuOpen === "compact" && (
              <MenuList
                entries={[
                  ...(showBack ? [{ label: t("library.title"), onClick: () => setBrowsing(true) }, "separator" as const] : []),
                  ...menus.flatMap((m): MenuEntry[] => [
                    { custom: <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--color-neutral-500)" }}>{m.label}</div> },
                    ...m.entries,
                  ]),
                ]}
                onClose={() => setMenuOpen(null)}
                width={260}
                style={{ left: 6, top: 38, maxWidth: "calc(100vw - 12px)", maxHeight: "calc(100vh - 44px)", overflowY: "auto" }}
              />
            )}
          </>
        ) : menus.map((m) => (
          <TopMenuButton key={m.key} def={m} anyOpen={menuOpen !== null} />
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", textAlign: "center", fontSize: 12, color: "var(--color-neutral-600)", pointerEvents: "none", whiteSpace: "nowrap" }}>
        {!compact && windowTitle}
      </div>

      {showBack && !compact && (
        <button
          className="btn btn-ghost no-drag"
          onClick={() => setBrowsing(true)}
          title={t("library.folderLibrary")}
          style={{ flexShrink: 0, whiteSpace: "nowrap", height: 24, padding: "0 8px", gap: 5, fontSize: 12, marginRight: 6, color: "var(--color-neutral-400)" }}
        >
          <i className="ph ph-squares-four" style={{ fontSize: 13 }} />
          <span className="library-label">{t("library.title")}</span>
        </button>
      )}

      <div className="window-controls" style={{ flexShrink: 0, height: "100%", display: "flex", justifyContent: "flex-end" }}>
        {!compact && <WindowButton
          icon={settings?.always_on_top ? "ph-fill ph-push-pin" : "ph ph-push-pin"}
          title={settings?.always_on_top ? t("topbar.unpin") : t("menu.alwaysOnTop")}
          active={!!settings?.always_on_top}
          onClick={() => toggleAlwaysOnTop()}
        />}
        <WindowButton icon="ph-minus" title={t("topbar.minimize")} onClick={() => window.crokit.window.minimize()} />
        <WindowButton icon="ph-corners-out" title={t("topbar.fullscreen")} onClick={() => window.crokit.window.toggleFullscreen()} />
        <WindowButton icon="ph-x" title={t("common.close")} danger onClick={() => window.crokit.window.close()} />
      </div>
    </div>
  );
}

function MenuHeading({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px 4px", fontSize: 11, color: "var(--color-neutral-600)" }}>
      <i className={`ph ${icon}`} style={{ width: 14, fontSize: 13 }} />
      {children}
    </div>
  );
}

function WindowButton({ icon, title, onClick, danger, active }: { icon: string; title: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  const restColor = active ? "var(--color-accent)" : "var(--color-neutral-500)";
  return (
    <button
      className="no-drag window-button"
      title={title}
      onClick={onClick}
      style={{
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
