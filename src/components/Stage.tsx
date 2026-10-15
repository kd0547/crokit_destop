import { useEffect, useRef, useState } from "react";
import { fileUrl } from "@/api/client";
import { useFolderStore } from "@/state/folderStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useSessionStore } from "@/state/sessionStore";
import { useUiStore } from "@/state/uiStore";
import { gifClearRange, gifSetA, gifSetB, gifStep, gifTogglePlay, gifToggleFreeze, loadGifFrames, nextPhoto, prevPhoto, stopSession, togglePause, wake } from "@/state/actions";
import { addFolderViaDialog, browseStep, startSession, togglePanel, toggleSetting } from "@/state/actions";
import { durLabel, fmtClock } from "@/lib/format";
import { gridBackgroundImage, hexToRgba } from "@/lib/color";
import { LibraryLayer } from "./LibraryLayer";
import { HistoryLayer } from "./HistoryLayer";

const GIF_FPS = 12;

export function Stage() {
  const files = useFolderStore((s) => s.files);
  const settings = useSettingsStore((s) => s.settings);
  const snapshot = useSessionStore((s) => s.snapshot);
  const ui = useUiStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });

  const sessionActive = snapshot.state !== "idle";
  const currentPath = sessionActive ? snapshot.current?.path ?? null : files[ui.currentIndex]?.path ?? null;
  const currentIsGif = sessionActive ? !!snapshot.current?.isGif : !!files[ui.currentIndex]?.is_gif;
  const visible = !sessionActive || snapshot.state === "paused" || ui.uiAwake;
  const low = snapshot.state === "running" && snapshot.remainingMs <= 10000;

  useEffect(() => {
    if (currentIsGif && currentPath) loadGifFrames(currentPath);
    else useUiStore.setState({ gifFrames: [] });
  }, [currentPath, currentIsGif]);

  // GIF playback loop
  useEffect(() => {
    if (!currentIsGif) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const s = useUiStore.getState();
      if (s.gifFrames.length > 0 && s.gifPlaying && !s.gifFrozen && t - last >= 1000 / (GIF_FPS * s.gifSpeed)) {
        last = t;
        const next = s.gifFrame + 1 > s.gifB || s.gifFrame < s.gifA ? s.gifA : s.gifFrame + 1;
        useUiStore.getState().setGifFrame(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [currentIsGif]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => setContainerSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, [ui.browsing]);

  const displaySrc = currentIsGif ? ui.gifFrames[ui.gifFrame] ?? currentPath : currentPath;

  let box = { width: 0, height: 0 };
  if (natural.width > 0 && natural.height > 0 && containerSize.width > 0 && containerSize.height > 0) {
    const scale = Math.min(containerSize.width / natural.width, containerSize.height / natural.height);
    box = { width: natural.width * scale, height: natural.height * scale };
  }

  const progressPct = snapshot.state === "running" ? Math.min(100, ((snapshot.durationSeconds * 1000 - snapshot.remainingMs + 1000) / (snapshot.durationSeconds * 1000)) * 100) : 0;

  return (
    <div style={{ flex: 1, position: "relative", minWidth: 0, background: "var(--color-bg)", overflow: "hidden" }}>
      {ui.browsing ? (
        <LibraryLayer />
      ) : (
        <main
          onMouseMove={wake}
          style={{ position: "absolute", inset: 0, cursor: !visible ? "none" : "default" }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: 2,
              width: `${progressPct}%`,
              background: "var(--color-accent)",
              boxShadow: "0 0 12px var(--color-accent)",
              transition: "width 1s linear",
              opacity: snapshot.state === "running" || snapshot.state === "break" ? 1 : 0,
            }}
          />

          {sessionActive && (
            <div
              style={{
                position: "absolute",
                top: 24,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 7,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "6px 16px 6px 12px",
                borderRadius: 999,
                background: "rgba(7,8,12,.78)",
                backdropFilter: "blur(12px)",
                border: `1px solid ${low ? "var(--color-accent-500)" : "var(--color-border-3)"}`,
                boxShadow: "0 8px 24px rgba(0,0,0,.5)",
                pointerEvents: "none",
                transition: "border-color .3s",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "var(--color-neutral-400)", paddingRight: 12, borderRight: "1px solid #2a2b36" }}>
                {snapshot.shownCount}{snapshot.totalCount ? ` / ${snapshot.totalCount}` : ""}
              </span>
              <span style={{ fontSize: 34, lineHeight: 1, fontWeight: 500, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color: low ? "var(--color-accent-300)" : "var(--color-text)" }}>
                {fmtClock(Math.ceil(snapshot.remainingMs / 1000))}
              </span>
              {(snapshot.state === "observe" || snapshot.state === "break") && (
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-accent-300)", paddingLeft: 12, borderLeft: "1px solid #2a2b36" }}>
                  {snapshot.state === "observe" ? "관찰" : "휴식"}
                </span>
              )}
            </div>
          )}

          <div ref={containerRef} style={{ position: "absolute", inset: currentIsGif ? "16px 16px 104px" : 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {displaySrc ? (
              <div
                style={{
                  position: "relative",
                  width: box.width || "auto",
                  height: box.height || "auto",
                  filter: settings?.gray ? "grayscale(1)" : "none",
                  transform: settings?.flip ? "scaleX(-1)" : "none",
                  transition: "filter .3s",
                }}
              >
                <img
                  src={fileUrl(displaySrc)}
                  onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                />
                {settings?.grid && <GridOverlay color={settings.grid_color} opacity={settings.grid_opacity} divisions={settings.grid_divisions} />}
              </div>
            ) : (
              <EmptyState />
            )}
          </div>

          {currentIsGif && (
            <GifBar frameCount={ui.gifFrames.length} visible={visible} />
          )}

          {settings && !settings.panel_open ? (
            <ControlDock bottom={currentIsGif ? 96 : 0} />
          ) : sessionActive && (
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: currentIsGif ? 112 : 22,
                transform: "translateX(-50%)",
                zIndex: 6,
                display: "flex",
                alignItems: "center",
                gap: 2,
                padding: 4,
                borderRadius: 12,
                background: "rgba(13,14,21,.86)",
                backdropFilter: "blur(14px)",
                border: "1px solid var(--color-divider)",
                boxShadow: "0 10px 30px rgba(0,0,0,.6)",
                transition: "opacity .4s, transform .4s",
                opacity: visible ? 1 : 0,
              }}
              className="no-drag"
            >
              <ControlIcon icon="ph ph-caret-left" title="이전 (←)" onClick={prevPhoto} size={36} iconSize={17} />
              <ControlIcon
                icon={snapshot.state === "paused" ? "ph-fill ph-play" : "ph-fill ph-pause"}
                title="일시정지 (Space)"
                onClick={togglePause}
                size={40}
                iconSize={18}
                accent
              />
              <ControlIcon icon="ph ph-caret-right" title="다음 (→)" onClick={nextPhoto} size={36} iconSize={17} />
              <div style={{ width: 1, height: 18, background: "#23242f", margin: "0 4px" }} />
              <ControlIcon icon="ph ph-circle-half" title="흑백" onClick={() => toggleSetting("gray")} size={36} iconSize={16} active={settings?.gray} />
              <ControlIcon icon="ph ph-flip-horizontal" title="좌우 반전" onClick={() => toggleSetting("flip")} size={36} iconSize={16} active={settings?.flip} />
              <ControlIcon icon="ph ph-grid-nine" title="그리드" onClick={() => toggleSetting("grid")} size={36} iconSize={16} active={settings?.grid} />
              <div style={{ width: 1, height: 18, background: "#23242f", margin: "0 4px" }} />
              <ControlIcon icon="ph ph-stop" title="세션 종료" onClick={stopSession} size={36} iconSize={16} />
            </div>
          )}

          {!sessionActive && <IdleOverlay />}
        </main>
      )}
      {ui.historyView && <HistoryLayer />}
    </div>
  );
}

function GridOverlay({ color, opacity, divisions }: { color: string; opacity: number; divisions: number }) {
  const line = hexToRgba(color, opacity);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage: gridBackgroundImage(divisions, line),
      }}
    />
  );
}

function ControlIcon({
  icon,
  title,
  onClick,
  size,
  iconSize,
  accent,
  active,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  size: number;
  iconSize: number;
  accent?: boolean;
  active?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="btn btn-ghost"
      style={{ width: size, height: size, padding: 0, color: accent || active ? "var(--color-accent)" : "var(--color-neutral-500)" }}
    >
      <i className={icon} style={{ fontSize: iconSize }} />
    </button>
  );
}

/**
 * Compact controls shown while the left panel is hidden: only a small handle
 * until the pointer enters the bottom strip, then the bar slides up.
 */
function ControlDock({ bottom }: { bottom: number }) {
  const settings = useSettingsStore((s) => s.settings);
  const snapshot = useSessionStore((s) => s.snapshot);
  const hasFiles = useFolderStore((s) => s.files.length > 0);
  const [hover, setHover] = useState(false);

  const sessionActive = snapshot.state !== "idle";
  const summary = settings ? `${durLabel(settings.duration_seconds)} × ${settings.count ? `${settings.count}장` : "무제한"}` : "";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "absolute", left: 0, right: 0, bottom, height: 84, zIndex: 6, cursor: "default" }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 10,
          width: 44,
          height: 4,
          borderRadius: 2,
          transform: "translateX(-50%)",
          background: "var(--color-neutral-700)",
          transition: "opacity .25s",
          opacity: hover ? 0 : 0.7,
        }}
      />
      <div
        className="no-drag"
        style={{
          position: "absolute",
          left: "50%",
          bottom: 16,
          transform: `translateX(-50%) translateY(${hover ? 0 : 10}px)`,
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: 3,
          borderRadius: 10,
          background: "rgba(13,14,21,.86)",
          backdropFilter: "blur(14px)",
          border: "1px solid var(--color-divider)",
          boxShadow: "0 10px 30px rgba(0,0,0,.6)",
          whiteSpace: "nowrap",
          transition: "opacity .25s, transform .25s",
          opacity: hover ? 1 : 0,
          pointerEvents: hover ? "auto" : "none",
        }}
      >
        <ControlIcon icon="ph ph-sidebar-simple" title="패널 열기 ( [ )" onClick={togglePanel} size={30} iconSize={14} />
        <div style={{ width: 1, height: 16, background: "#23242f", margin: "0 3px" }} />
        <ControlIcon icon="ph ph-caret-left" title="이전 (←)" onClick={() => (sessionActive ? prevPhoto() : browseStep(-1))} size={30} iconSize={15} />
        {sessionActive ? (
          <ControlIcon
            icon={snapshot.state === "paused" ? "ph-fill ph-play" : "ph-fill ph-pause"}
            title="일시정지 (Space)"
            onClick={togglePause}
            size={34}
            iconSize={16}
            accent
          />
        ) : (
          <ControlIcon icon="ph-fill ph-play" title="시작 (Space)" onClick={() => hasFiles && startSession()} size={34} iconSize={16} accent />
        )}
        <ControlIcon icon="ph ph-caret-right" title="다음 (→)" onClick={() => (sessionActive ? nextPhoto() : browseStep(1))} size={30} iconSize={15} />
        {sessionActive && <ControlIcon icon="ph ph-stop" title="세션 종료 (Esc)" onClick={stopSession} size={30} iconSize={14} />}
        <div style={{ width: 1, height: 16, background: "#23242f", margin: "0 3px" }} />
        <ControlIcon icon="ph ph-circle-half" title="흑백" onClick={() => toggleSetting("gray")} size={30} iconSize={14} active={settings?.gray} />
        <ControlIcon icon="ph ph-flip-horizontal" title="좌우 반전" onClick={() => toggleSetting("flip")} size={30} iconSize={14} active={settings?.flip} />
        <ControlIcon icon="ph ph-grid-nine" title="그리드" onClick={() => toggleSetting("grid")} size={30} iconSize={14} active={settings?.grid} />
        {!sessionActive && <span style={{ padding: "0 8px 0 6px", fontSize: 11, color: "var(--color-neutral-500)" }}>{summary}</span>}
      </div>
    </div>
  );
}

function GifBar({ frameCount, visible }: { frameCount: number; visible: boolean }) {
  const ui = useUiStore();
  const playing = ui.gifPlaying && !ui.gifFrozen;
  const hasRange = !(ui.gifA === 0 && ui.gifB === frameCount - 1);

  return (
    <>
      <div style={{ position: "absolute", top: 26, left: 26, zIndex: 5, display: "flex", alignItems: "center", gap: 6, pointerEvents: "none", transition: "opacity .4s", opacity: visible ? 1 : 0.4 }}>
        <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, letterSpacing: ".06em", padding: "3px 10px", borderRadius: 6, background: "var(--color-accent-800)", color: "var(--color-accent-100)" }}>GIF</span>
        <span style={{ fontSize: 11, color: "var(--color-neutral-400)", fontVariantNumeric: "tabular-nums" }}>
          {frameCount}프레임 · {GIF_FPS}fps · {(frameCount / GIF_FPS).toFixed(1)}초
        </span>
        {ui.gifFrozen && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--color-accent)", color: "var(--color-accent)" }}>
            <i className="ph ph-push-pin" />프레임 고정됨
          </span>
        )}
      </div>

      <div
        className="no-drag"
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 16,
          zIndex: 6,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "10px 12px",
          borderRadius: "var(--radius-md)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          transition: "opacity .4s",
          opacity: visible ? 1 : 0,
        }}
      >
        <div style={{ display: "flex", gap: 2, height: 22, alignItems: "stretch" }}>
          {Array.from({ length: frameCount }, (_, i) => {
            const cur = i === ui.gifFrame;
            const inRange = i >= ui.gifA && i <= ui.gifB;
            return (
              <button
                key={i}
                title={`${i + 1}프레임`}
                onClick={() => {
                  ui.setGifFrame(i);
                  ui.setGifPlaying(false);
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 0,
                  borderRadius: 3,
                  border: `1px solid ${cur ? "var(--color-accent-400)" : "#1f2029"}`,
                  background: cur ? "var(--color-accent-700)" : inRange ? "#1a1b25" : "#0f1017",
                  position: "relative",
                }}
              >
                <span style={{ position: "absolute", left: -1, right: -1, bottom: -5, height: 2, borderRadius: 1, background: "var(--color-accent)", opacity: inRange && hasRange ? 1 : 0 }} />
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
          <ControlIcon icon="ph ph-skip-back" title="이전 프레임 ( , )" onClick={() => gifStep(-1)} size={30} iconSize={15} />
          <ControlIcon icon={playing ? "ph-fill ph-pause" : "ph-fill ph-play"} title="GIF 재생/정지 (K)" onClick={gifTogglePlay} size={34} iconSize={16} accent />
          <ControlIcon icon="ph ph-skip-forward" title="다음 프레임 ( . )" onClick={() => gifStep(1)} size={30} iconSize={15} />
          <span style={{ flex: "none", fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--color-neutral-300)" }}>
            {String(ui.gifFrame + 1).padStart(2, "0")} / {frameCount}
          </span>
          <div style={{ display: "flex", gap: 2, padding: 2, borderRadius: 6, background: "var(--color-bg)", border: "1px solid var(--color-border)", flex: "none" }}>
            {[0.5, 1, 2].map((v) => (
              <button
                key={v}
                onClick={() => ui.setGifSpeed(v)}
                style={{ height: 24, padding: "0 8px", borderRadius: 4, font: "500 11px var(--font-body)", background: ui.gifSpeed === v ? "#1a1b25" : "transparent", color: ui.gifSpeed === v ? "var(--color-text)" : "var(--color-neutral-600)" }}
              >
                {v}×
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 4 }} />
          <button className="btn btn-ghost" onClick={gifSetA} title="현재 프레임을 구간 시작으로" style={{ flex: "none", height: 28, padding: "0 6px", fontSize: 12 }}>A{ui.gifA + 1}</button>
          <button className="btn btn-ghost" onClick={gifSetB} title="현재 프레임을 구간 끝으로" style={{ flex: "none", height: 28, padding: "0 6px", fontSize: 12 }}>B{ui.gifB + 1}</button>
          <ControlIcon icon="ph ph-arrows-counter-clockwise" title="구간 해제" onClick={gifClearRange} size={28} iconSize={14} />
          <div style={{ width: 1, height: 18, background: "#23242f", margin: "0 2px" }} />
          <button
            className="btn btn-secondary"
            onClick={gifToggleFreeze}
            style={{ flex: "none", whiteSpace: "nowrap", height: 30, padding: "0 12px", fontSize: 12, gap: 6, color: ui.gifFrozen ? "var(--color-accent-200)" : "var(--color-neutral-300)", borderColor: ui.gifFrozen ? "var(--color-accent-500)" : "var(--color-border-strong)" }}
          >
            <i className="ph ph-push-pin" style={{ fontSize: 14 }} />
            {ui.gifFrozen ? "고정 해제" : "프레임 고정"}
          </button>
        </div>
      </div>
    </>
  );
}

const DONE_NOTICE_MS = 5000;

function IdleOverlay() {
  const done = useUiStore((s) => s.done);
  const files = useFolderStore((s) => s.files);
  // only the notice fades out; `done` itself stays set (startSession uses it to restart from the top)
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!done) return;
    setShown(true);
    const timer = setTimeout(() => setShown(false), DONE_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [done]);

  if (files.length === 0 || !done) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 64,
        left: "50%",
        transform: "translateX(-50%)",
        textAlign: "center",
        pointerEvents: "none",
        zIndex: 4,
        transition: "opacity .6s",
        opacity: shown ? 1 : 0,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 500 }}>{`세션 완료 · ${done.n}장`}</div>
      <div style={{ fontSize: 12, color: "var(--color-neutral-600)", marginTop: 4 }}>
        {done.n > 0 ? `${done.mins}분 연습했어요. 히스토리에 저장됨.` : "시간을 다 채운 이미지가 없어 히스토리에 저장하지 않았어요."}
      </div>
    </div>
  );
}

function EmptyState() {
  const hasFolders = useFolderStore((s) => s.folders.length > 0);
  const hasSelection = useSettingsStore((s) => (s.settings?.folder_selection.length ?? 0) > 0);
  const setBrowsing = useUiStore((s) => s.setBrowsing);
  const message = !hasFolders ? "사진 폴더를 등록하세요" : hasSelection ? "선택한 폴더에 이미지가 없습니다" : "연습할 폴더를 고르세요";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "var(--color-neutral-700)" }}>
      <i className="ph ph-image" style={{ fontSize: 32 }} />
      <span style={{ fontSize: 12.5 }}>{message}</span>
      <button className="btn btn-ghost" onClick={() => (hasFolders ? setBrowsing(true) : addFolderViaDialog())} style={{ height: 30, padding: "0 12px", fontSize: 12.5, gap: 6 }}>
        <i className={`ph ${hasFolders ? "ph-squares-four" : "ph-folder-simple-plus"}`} style={{ fontSize: 14 }} />
        {hasFolders ? "라이브러리 열기" : "폴더 등록"}
      </button>
    </div>
  );
}
