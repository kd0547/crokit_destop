import { useEffect } from "react";
import { useSettingsStore } from "@/state/settingsStore";
import { useFolderStore } from "@/state/folderStore";
import { useHistoryStore } from "@/state/historyStore";
import { useSessionStore } from "@/state/sessionStore";
import { useUiStore } from "@/state/uiStore";
import {
  addCountPreset,
  addDurationPreset,
  addObservePreset,
  addFolderViaDialog,
  removeCountPreset,
  removeDurationPreset,
  removeObservePreset,
  selectCount,
  selectDuration,
  selectObserve,
  setBreakEvery,
  setBreakSeconds,
  setOrderMode,
  startSession,
  stopSession,
  togglePanel,
} from "@/state/actions";
import { durLabel, formatDateLabel, formatTimeLabel } from "@/lib/format";
import { thumbUrl } from "@/api/client";
import { findNode } from "@/lib/folderTree";
import { HistoryImages } from "./HistoryImages";
import { SelectionChip } from "./LibraryLayer";

const chipBase: React.CSSProperties = {
  flex: 1,
  height: 34,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  font: "500 12px var(--font-body)",
};

function chipStyle(active: boolean, dashed = false): React.CSSProperties {
  return active
    ? { ...chipBase, background: "var(--color-accent-900)", border: "1px solid var(--color-accent-600)", color: "var(--color-accent-200)" }
    : { ...chipBase, background: dashed ? "transparent" : "var(--color-surface-2)", border: `1px ${dashed ? "dashed" : "solid"} ${dashed ? "var(--color-border-strong)" : "var(--color-border-2)"}`, color: "var(--color-neutral-400)" };
}

export function Sidebar() {
  const { settings, updateSettings } = useSettingsStore();
  const files = useFolderStore((s) => s.files);
  const snapshot = useSessionStore((s) => s.snapshot);
  const ui = useUiStore();
  const { entries: history, stats, fetchHistory } = useHistoryStore();

  const visible = settings?.panel_open ?? true;
  const running = snapshot.state !== "idle";

  useEffect(() => {
    if (ui.section !== "history") return;
    fetchHistory();
    // main process saves the finished session (with thumbnails) asynchronously
    return window.crokit.history.onUpdated(() => fetchHistory());
  }, [ui.section, fetchHistory]);

  if (!settings) return <div style={{ width: visible ? 296 : 0 }} />;

  const observeSecs = settings.observe_enabled ? settings.observe_seconds : 0;
  const perImage = observeSecs ? `(관찰 ${durLabel(observeSecs)} + ${durLabel(settings.duration_seconds)})` : durLabel(settings.duration_seconds);
  const totalMin = Math.round(((settings.count || 0) * (observeSecs + settings.duration_seconds)) / 60);
  const sessionSummary = settings.count ? `${perImage} × ${settings.count}장 · 약 ${totalMin}분` : `${perImage} × 무제한`;

  return (
    <aside
      style={{
        width: visible ? 296 : 0,
        flex: "none",
        overflow: "hidden",
        transition: "width .28s cubic-bezier(.2,.7,.2,1)",
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      <div style={{ width: 296, height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 12px 10px 18px" }}>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-icon" title="패널 닫기 ( [ )" onClick={() => togglePanel()} style={{ width: 30, height: 30 }}>
            <i className="ph ph-sidebar-simple" style={{ fontSize: 17 }} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 2, margin: "0 12px 6px", padding: 3, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
          {(
            [
              ["session", "세션", "ph-timer"],
              ["history", "히스토리", "ph-clock-counter-clockwise"],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => ui.setSection(key)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                height: 30,
                borderRadius: 6,
                font: "500 12px var(--font-body)",
                background: ui.section === key ? "#1a1b25" : "transparent",
                color: ui.section === key ? "var(--color-text)" : "var(--color-neutral-600)",
              }}
            >
              <i className={`ph ${icon}`} style={{ fontSize: 14 }} />
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px 18px" }}>
          {ui.section === "session" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <FolderSection running={running} />

              {/* observe */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, letterSpacing: ".06em", color: "var(--color-neutral-600)" }}>관찰 시간 · 그리기 전</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(56px,1fr))", gap: 6 }}>
                  {settings.observe_presets.map((p) => (
                    <PresetChip
                      key={p.seconds}
                      label={durLabel(p.seconds)}
                      active={settings.observe_enabled && settings.observe_seconds === p.seconds}
                      removable={p.isUser}
                      onSelect={() => selectObserve(p.seconds)}
                      onRemove={() => removeObservePreset(p.seconds)}
                    />
                  ))}
                  <button style={chipStyle(!settings.observe_enabled)} onClick={() => selectObserve(null)}>끔</button>
                  <button style={chipStyle(ui.observeEditorOpen, true)} onClick={() => ui.setObserveEditorOpen(!ui.observeEditorOpen)}>
                    <i className="ph ph-plus" style={{ fontSize: 12 }} />
                    설정
                  </button>
                </div>
                {ui.observeEditorOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: "var(--radius-md)", background: "var(--color-surface-2)", border: "1px solid var(--color-accent-700)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, font: "500 12px var(--font-body)", color: "var(--color-accent-200)" }}>
                      <i className="ph ph-sliders-horizontal" style={{ fontSize: 14 }} />
                      관찰 시간 설정
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="number"
                        min={1}
                        max={600}
                        value={ui.customObserve}
                        onChange={(e) => ui.setCustomObserve(Math.min(600, Math.max(1, Number(e.target.value) || 1)))}
                        style={inputStyle(72)}
                      />
                      <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>초</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost" onClick={() => ui.setObserveEditorOpen(false)} style={{ height: 28, padding: "0 10px", fontSize: 12 }}>취소</button>
                      <button className="btn btn-primary" onClick={addObservePreset} style={{ height: 28, padding: "0 12px", fontSize: 12, gap: 5 }}>
                        <i className="ph ph-plus" style={{ fontSize: 12 }} />
                        {durLabel(ui.customObserve)} 추가
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* duration */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, letterSpacing: ".06em", color: "var(--color-neutral-600)" }}>한 장당 시간</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                  {settings.duration_presets.map((p) => (
                    <PresetChip
                      key={p.seconds}
                      label={durLabel(p.seconds)}
                      active={settings.duration_seconds === p.seconds}
                      removable={p.isUser}
                      onSelect={() => selectDuration(p.seconds)}
                      onRemove={() => removeDurationPreset(p.seconds)}
                    />
                  ))}
                  <button style={chipStyle(ui.editorOpen, true)} onClick={() => ui.setEditorOpen(!ui.editorOpen)}>
                    <i className="ph ph-plus" style={{ fontSize: 12 }} />
                    설정
                  </button>
                </div>
                {ui.editorOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: "var(--radius-md)", background: "var(--color-surface-2)", border: "1px solid var(--color-accent-700)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, font: "500 12px var(--font-body)", color: "var(--color-accent-200)" }}>
                      <i className="ph ph-sliders-horizontal" style={{ fontSize: 14 }} />
                      시간 설정
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <TimeInput value={ui.customH} max={23} onChange={(v) => ui.setCustomTime(v, ui.customM, ui.customS)} suffix="시" />
                      <span style={{ color: "var(--color-neutral-700)" }}>:</span>
                      <TimeInput value={ui.customM} max={59} onChange={(v) => ui.setCustomTime(ui.customH, v, ui.customS)} suffix="분" />
                      <span style={{ color: "var(--color-neutral-700)" }}>:</span>
                      <TimeInput value={ui.customS} max={59} onChange={(v) => ui.setCustomTime(ui.customH, ui.customM, v)} suffix="초" />
                    </div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost" onClick={() => ui.setEditorOpen(false)} style={{ height: 28, padding: "0 10px", fontSize: 12 }}>취소</button>
                      <button className="btn btn-primary" onClick={addDurationPreset} style={{ height: 28, padding: "0 12px", fontSize: 12, gap: 5 }}>
                        <i className="ph ph-plus" style={{ fontSize: 12 }} />
                        {durLabel(Math.max(1, ui.customH * 3600 + ui.customM * 60 + ui.customS))} 추가
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* count */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, letterSpacing: ".06em", color: "var(--color-neutral-600)" }}>장수</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(56px,1fr))", gap: 6 }}>
                  {settings.count_presets.map((p) => (
                    <PresetChip
                      key={p.count}
                      label={`${p.count}`}
                      active={settings.count === p.count}
                      removable={p.isUser}
                      onSelect={() => selectCount(p.count)}
                      onRemove={() => removeCountPreset(p.count)}
                    />
                  ))}
                  <button style={chipStyle(settings.count === 0)} onClick={() => selectCount(0)}>∞</button>
                  <button style={chipStyle(ui.countEditorOpen, true)} onClick={() => ui.setCountEditorOpen(!ui.countEditorOpen)}>
                    <i className="ph ph-plus" style={{ fontSize: 12 }} />
                    설정
                  </button>
                </div>
                {ui.countEditorOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: "var(--radius-md)", background: "var(--color-surface-2)", border: "1px solid var(--color-accent-700)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, font: "500 12px var(--font-body)", color: "var(--color-accent-200)" }}>
                      <i className="ph ph-sliders-horizontal" style={{ fontSize: 14 }} />
                      장수 설정
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={ui.customCount}
                        onChange={(e) => ui.setCustomCount(Math.min(999, Math.max(1, Number(e.target.value) || 1)))}
                        style={inputStyle(1)}
                      />
                      <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>장</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost" onClick={() => ui.setCountEditorOpen(false)} style={{ height: 28, padding: "0 10px", fontSize: 12 }}>취소</button>
                      <button className="btn btn-primary" onClick={addCountPreset} style={{ height: 28, padding: "0 12px", fontSize: 12, gap: 5 }}>
                        <i className="ph ph-plus" style={{ fontSize: 12 }} />
                        {ui.customCount}장 추가
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* order */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, letterSpacing: ".06em", color: "var(--color-neutral-600)" }}>순서</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <button style={chipStyle(settings.order_mode === "random")} onClick={() => setOrderMode("random")}>
                    <i className="ph ph-shuffle" />랜덤
                  </button>
                  <button style={chipStyle(settings.order_mode === "seq")} onClick={() => setOrderMode("seq")}>
                    <i className="ph ph-list-numbers" />순서대로
                  </button>
                </div>
              </div>

              {/* break interval */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: settings.breaks_enabled ? 1 : 0.45, transition: "opacity .2s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, fontSize: 11, letterSpacing: ".06em", color: "var(--color-neutral-600)" }}>휴식 간격</div>
                  <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{settings.breaks_enabled ? "켜짐" : "꺼짐 · 설정에서 켜기"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)" }}>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={settings.break_every}
                    disabled={!settings.breaks_enabled}
                    onChange={(e) => setBreakEvery(Number(e.target.value) || 1)}
                    style={inputStyle(56)}
                  />
                  <span>장마다</span>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={settings.break_seconds}
                    disabled={!settings.breaks_enabled}
                    onChange={(e) => setBreakSeconds(Number(e.target.value) || 1)}
                    style={inputStyle(56)}
                  />
                  <span>초 휴식</span>
                </div>
              </div>

              <div style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>{sessionSummary}</div>
            </div>
          )}

          {ui.section === "history" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {history.length === 0 && <div style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>아직 연습 기록이 없습니다.</div>}
              {history.map((h) => (
                <div key={h.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 0" }}>
                  <button
                    className="history-row"
                    title="연습한 이미지 목록 보기"
                    onClick={() => ui.setHistoryView({ entryId: h.id, index: null })}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      margin: "0 -6px",
                      padding: "4px 6px",
                      borderRadius: 6,
                      textAlign: "left",
                      color: "var(--color-text)",
                      background: ui.historyView?.entryId === h.id && ui.historyView.index === null ? "var(--color-hover)" : undefined,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%" }}>
                      <div style={{ flex: 1, fontWeight: 500 }}>{formatDateLabel(h.created_at)}</div>
                      <div style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{formatTimeLabel(h.created_at)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--color-neutral-500)" }}>
                      <span>{h.folder_name}</span>
                      <span style={{ color: "var(--color-neutral-800)" }}>·</span>
                      <span>{durLabel(h.duration_seconds)} × {h.images_count}장 · {h.minutes}분</span>
                    </div>
                  </button>
                  <HistoryImages entry={h} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 18, marginTop: 6, padding: "14px 0 4px", borderTop: "1px solid var(--color-divider)" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 500 }}>{stats.sessions}회</div>
                  <div style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>이번 주 세션</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 500 }}>{stats.minutes}분</div>
                  <div style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>이번 주 연습 시간</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 18px 18px", borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            className="btn btn-primary btn-block"
            onClick={() => (running ? stopSession() : startSession())}
            disabled={!running && files.length === 0}
            style={{ height: 40, gap: 8 }}
          >
            <i className={`ph ${running ? "ph-stop" : "ph-play"}`} style={{ fontSize: 15 }} />
            {running ? "세션 종료" : "시작"}
          </button>
          <div style={{ fontSize: 11, color: "var(--color-neutral-700)", textAlign: "center" }}>Space 세션 · ← → 사진 · K GIF</div>
        </div>
      </div>
    </aside>
  );
}

/** selected practice folders: cover strip, chips, and the button that opens the library layer */
function FolderSection({ running }: { running: boolean }) {
  const folders = useFolderStore((s) => s.folders);
  const files = useFolderStore((s) => s.files);
  const loading = useFolderStore((s) => s.loading);
  const items = useSettingsStore((s) => s.settings?.folder_selection ?? []);
  const browsing = useUiStore((s) => s.browsing);
  const setBrowsing = useUiStore((s) => s.setBrowsing);

  // up to 4 covers, spread over the selected folders
  const covers: { folderId: string; path: string }[] = [];
  for (let round = 0; covers.length < 4 && round < 4; round++) {
    for (const item of items) {
      const folder = folders.find((f) => f.id === item.folder_id);
      const node = folder && findNode(folder, item.rel_path);
      const path = node?.samples[round];
      if (folder && path && covers.length < 4) covers.push({ folderId: folder.id, path });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, fontSize: 11, letterSpacing: ".06em", color: "var(--color-neutral-600)" }}>사진 폴더</div>
        <button className="btn btn-ghost btn-icon" title="폴더 등록" onClick={addFolderViaDialog} style={{ width: 24, height: 24 }}>
          <i className="ph ph-plus" style={{ fontSize: 14 }} />
        </button>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 10,
          borderRadius: "var(--radius-md)",
          background: "var(--color-surface-2)",
          border: `1px solid ${browsing ? "var(--color-accent-600)" : "var(--color-border-2)"}`,
        }}
      >
        {folders.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 4px 4px", textAlign: "center", fontSize: 11.5, color: "var(--color-neutral-600)" }}>
            <i className="ph ph-folders" style={{ fontSize: 24, color: "var(--color-accent-700)" }} />
            레퍼런스 사진 폴더를 등록하세요
            <br />
            (하위 폴더 포함 · 끌어다 놓기 가능)
          </div>
        ) : (
          <>
            {covers.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3, height: 52, borderRadius: 6, overflow: "hidden", background: "var(--color-bg)" }}>
                {covers.map((c) => (
                  <img key={c.path} src={thumbUrl(c.folderId, c.path)} loading="lazy" decoding="async" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", minWidth: 0 }} />
                ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontWeight: 500 }}>{items.length ? `${items.length}개 폴더` : "선택된 폴더 없음"}</span>
              <span style={{ fontSize: 11, color: "var(--color-neutral-600)", fontVariantNumeric: "tabular-nums" }}>{loading ? "…" : `${files.length}장`}</span>
            </div>
            {items.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {items.map((item) => (
                  <SelectionChip key={`${item.folder_id}|${item.rel_path}|${item.recursive}`} folders={folders} item={item} />
                ))}
              </div>
            )}
          </>
        )}
        <button
          className="btn btn-primary btn-block"
          onClick={() => (folders.length === 0 ? addFolderViaDialog() : setBrowsing(!browsing))}
          disabled={running}
          title={running ? "세션 중에는 폴더를 바꿀 수 없습니다" : undefined}
          style={{ height: 32, fontSize: 12.5, gap: 6 }}
        >
          <i className={`ph ${folders.length === 0 ? "ph-folder-simple-plus" : browsing ? "ph-x" : "ph-squares-four"}`} style={{ fontSize: 14 }} />
          {folders.length === 0 ? "폴더 등록" : browsing ? "라이브러리 닫기" : "라이브러리에서 고르기"}
        </button>
      </div>
    </div>
  );
}

function PresetChip({
  label,
  active,
  removable,
  onSelect,
  onRemove,
}: {
  label: string;
  active: boolean;
  removable: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ position: "relative", display: "flex" }}>
      <button style={chipStyle(active)} onClick={onSelect}>
        {label}
      </button>
      {removable && (
        <button
          title="삭제"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            position: "absolute",
            top: -5,
            right: -5,
            width: 16,
            height: 16,
            padding: 0,
            borderRadius: "50%",
            border: "1px solid var(--color-border-strong)",
            background: "var(--color-surface)",
            color: "var(--color-neutral-400)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <i className="ph ph-x" style={{ fontSize: 9 }} />
        </button>
      )}
    </div>
  );
}

function TimeInput({ value, max, onChange, suffix }: { value: number; max: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
        style={inputStyle("100%")}
      />
      <span style={{ flex: "none", fontSize: 11, color: "var(--color-neutral-500)" }}>{suffix}</span>
    </div>
  );
}

function inputStyle(width: number | string): React.CSSProperties {
  return {
    width,
    minWidth: 0,
    height: 28,
    padding: "0 6px",
    borderRadius: 6,
    background: "var(--color-bg)",
    border: "1px solid var(--color-border-3)",
    color: "var(--color-text)",
    font: "500 13px var(--font-body)",
    fontVariantNumeric: "tabular-nums",
    textAlign: "center",
  };
}
