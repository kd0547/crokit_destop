import { useEffect, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { Stage } from "./components/Stage";
import { useFlipHotkey } from "./hooks/useFlipHotkey";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWindowTitle } from "./hooks/useWindowTitle";
import { addFolderPath, initApp } from "./state/actions";
import { useSessionStore } from "./state/sessionStore";
import { useUiStore } from "./state/uiStore";

function Shell() {
  const subscribeSession = useSessionStore((s) => s.subscribe);
  useKeyboardShortcuts();
  useFlipHotkey();
  useWindowTitle();

  useEffect(() => {
    initApp();
    const unsubscribe = subscribeSession();

    const onResizeEnd = () => window.crokit.window.notifyResizeMoveEnd();
    window.addEventListener("resize", onResizeEnd);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", onResizeEnd);
    };
  }, [subscribeSession]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)" }}>
      <TopBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Sidebar />
        <Stage />
      </div>
      <FolderDropZone />
      <Notice />
    </div>
  );
}

/** drop folders from Explorer anywhere on the window to register them */
function FolderDropZone() {
  const [over, setOver] = useState(false);
  const running = useSessionStore((s) => s.snapshot.state !== "idle");

  useEffect(() => {
    let depth = 0; // dragenter/leave fire for every child element
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const onOver = (e: DragEvent) => {
      // without this Electron navigates to the dropped file
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = running ? "none" : "copy";
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setOver(false);
      if (running) return;
      const paths = Array.from(e.dataTransfer?.files ?? []).map((f) => window.crokit.files.getPathForFile(f)).filter(Boolean);
      for (const path of paths) await addFolderPath(path);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [running]);

  if (!over || running) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 10,
        zIndex: 50,
        pointerEvents: "none",
        borderRadius: "var(--radius-lg)",
        border: "2px dashed var(--color-accent)",
        background: "color-mix(in srgb, var(--color-bg) 82%, var(--color-accent))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "var(--color-accent-200)",
      }}
    >
      <i className="ph ph-folder-simple-plus" style={{ fontSize: 40 }} />
      <div style={{ fontSize: 15, fontWeight: 500 }}>폴더를 놓으면 라이브러리에 등록돼요</div>
      <div style={{ fontSize: 12, color: "var(--color-accent-400)" }}>하위 폴더까지 모두 읽어 옵니다</div>
    </div>
  );
}

function Notice() {
  const notice = useUiStore((s) => s.notice);
  if (!notice) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 96,
        transform: "translateX(-50%)",
        zIndex: 60,
        padding: "8px 14px",
        borderRadius: "var(--radius-md)",
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border-3)",
        boxShadow: "0 10px 30px rgba(0,0,0,.6)",
        fontSize: 12.5,
        pointerEvents: "none",
      }}
    >
      {notice}
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <Shell />
    </ErrorBoundary>
  );
}
