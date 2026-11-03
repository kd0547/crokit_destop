import { useEffect, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { Stage } from "./components/Stage";
import { useFlipHotkey } from "./hooks/useFlipHotkey";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMouseNavigation } from "./hooks/useMouseNavigation";
import { useWindowTitle } from "./hooks/useWindowTitle";
import { addCustomImages, addFolderPath, initApp } from "./state/actions";
import { useFolderStore } from "./state/folderStore";
import { useSessionStore } from "./state/sessionStore";
import { useUiStore } from "./state/uiStore";

function Shell() {
  const subscribeSession = useSessionStore((s) => s.subscribe);
  useKeyboardShortcuts();
  useMouseNavigation();
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

const IMAGE_EXT = /\.(png|jpe?g|bmp|webp|gif)$/i;

/** folders get registered as-is, image files get copied into the "커스텀" folder */
function splitDrop(dt: DataTransfer | null): { folders: string[]; images: File[]; skipped: number } {
  const out = { folders: [] as string[], images: [] as File[], skipped: 0 };
  if (!dt) return out;
  const files = Array.from(dt.files);
  // entries are only readable while the drop event is being dispatched
  const entries = Array.from(dt.items).filter((i) => i.kind === "file").map((i) => i.webkitGetAsEntry());
  files.forEach((file, i) => {
    const path = window.crokit.files.getPathForFile(file);
    if (entries[i]?.isDirectory) {
      if (path) out.folders.push(path);
    } else if (file.type.startsWith("image/") || IMAGE_EXT.test(file.name)) {
      out.images.push(file);
    } else {
      out.skipped++;
    }
  });
  return out;
}

/**
 * Custom folder that dropped pictures go into: the custom folder card under the
 * cursor, else the custom folder open in the library, else none (= the server
 * picks the first custom folder, creating "커스텀" if there is none).
 */
function customDropTarget(target: EventTarget | null): string | null {
  const card = target instanceof Element ? target.closest<HTMLElement>("[data-custom-folder]") : null;
  if (card?.dataset.customFolder) return card.dataset.customFolder;
  const { browsing, libraryPath } = useUiStore.getState();
  const open = browsing && libraryPath ? useFolderStore.getState().folders.find((f) => f.id === libraryPath.folderId) : null;
  return open?.kind === "custom" ? open.id : null;
}

/** drop folders or pictures from Explorer anywhere on the window to add them to the library */
function FolderDropZone() {
  const [over, setOver] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const running = useSessionStore((s) => s.snapshot.state !== "idle");
  const folders = useFolderStore((s) => s.folders);

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
      if (hasFiles(e)) setTargetId(customDropTarget(e.target));
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setOver(false);
      if (running) return;
      const { folders, images, skipped } = splitDrop(e.dataTransfer);
      const target = customDropTarget(e.target);
      for (const path of folders) await addFolderPath(path);
      if (images.length > 0) await addCustomImages(images, target ?? undefined);
      else if (skipped > 0 && folders.length === 0) useUiStore.getState().showNotice("폴더나 그림 파일만 놓을 수 있어요");
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

  useEffect(() => {
    // outline the custom folder card the pictures will land in
    if (!over || !targetId) return;
    const cards = document.querySelectorAll(`[data-custom-folder="${CSS.escape(targetId)}"]`);
    cards.forEach((c) => c.classList.add("drop-target"));
    return () => cards.forEach((c) => c.classList.remove("drop-target"));
  }, [over, targetId]);

  if (!over || running) return null;
  const custom = folders.filter((f) => f.kind === "custom");
  const targetName = (targetId ? folders.find((f) => f.id === targetId) : custom[0])?.name ?? "커스텀";
  return (
    <div
      style={{
        position: "fixed",
        inset: 10,
        zIndex: 50,
        pointerEvents: "none",
        borderRadius: "var(--radius-lg)",
        border: "2px dashed var(--color-accent)",
        background: "color-mix(in srgb, transparent 90%, var(--color-accent))",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 18px",
          borderRadius: "var(--radius-lg)",
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-accent-700)",
          boxShadow: "0 10px 30px rgba(0,0,0,.5)",
          color: "var(--color-accent-200)",
        }}
      >
        <i className="ph ph-folder-simple-plus" style={{ fontSize: 28 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>그림은 '{targetName}' 폴더에 저장돼요</div>
          <div style={{ marginTop: 2, fontSize: 12, color: "var(--color-accent-400)" }}>
            {custom.length > 1 ? "다른 커스텀 폴더 위에 놓으면 그 폴더에 저장 · " : ""}폴더를 놓으면 라이브러리에 등록
          </div>
        </div>
      </div>
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
