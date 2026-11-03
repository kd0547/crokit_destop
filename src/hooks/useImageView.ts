import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { constrainView, fitImage, initialImageView, rotateAt, rotationDelta, zoomAt, type Size } from "@/lib/imageView";
import { wake } from "@/state/actions";

export function useImageView({ containerRef, image, viewport, source, enabled }: {
  containerRef: RefObject<HTMLDivElement>;
  image: Size;
  viewport: Size;
  source: string | null;
  enabled: boolean;
}) {
  const [view, setView] = useState(initialImageView);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; mode: "pan" | "rotate"; x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressContextMenu = useRef(false);
  const reset = useCallback(() => {
    setView(initialImageView);
    drag.current = null;
    suppressContextMenu.current = false;
    setDragging(false);
  }, []);
  const rotate = useCallback(() => {
    setView((previous) => rotateAt(previous, 90));
    wake();
  }, []);

  useEffect(reset, [source, reset]);
  useEffect(() => {
    if (enabled) return;
    drag.current = null;
    setDragging(false);
  }, [enabled]);
  useEffect(() => {
    setView((previous) => constrainView(previous, image, viewport));
  }, [image.width, image.height, viewport.width, viewport.height]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled || !source) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (drag.current) return;
      const rect = container.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const factor = Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002);
      setView((previous) => zoomAt(previous, factor, event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2, image, viewport));
      wake();
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [containerRef, enabled, source, image.width, image.height, viewport.width, viewport.height]);

  useEffect(() => {
    if (!enabled || !source) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
      if (event.key === "0" || event.code === "Numpad0") {
        event.preventDefault();
        reset();
        wake();
      } else if (event.key.toLowerCase() === "r" && !event.repeat) {
        event.preventDefault();
        rotate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, source, reset, rotate]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || !source || (event.button !== 0 && event.button !== 2) || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressContextMenu.current = false;
    drag.current = { id: event.pointerId, mode: event.button === 2 ? "rotate" : "pan", x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, moved: false };
    setDragging(true);
    wake();
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const moved = start.moved || Math.hypot(event.clientX - start.originX, event.clientY - start.originY) >= 4;
    if (start.mode === "rotate" && !moved) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    drag.current = { ...start, x: event.clientX, y: event.clientY, moved };
    if (start.mode === "rotate") {
      suppressContextMenu.current = true;
      const rect = event.currentTarget.getBoundingClientRect();
      const from = { x: start.x - rect.left - rect.width / 2, y: start.y - rect.top - rect.height / 2 };
      const to = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      const degrees = rotationDelta(from, to);
      setView((previous) => rotateAt(previous, degrees));
    } else {
      setView((previous) => constrainView({ ...previous, x: previous.x + dx, y: previous.y + dy }, image, viewport));
    }
    wake();
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    view, box: fitImage(image, viewport), dragging, reset, rotate,
    shouldSuppressContextMenu: () => suppressContextMenu.current,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onLostPointerCapture: endDrag, onDoubleClick: () => { if (enabled && source) { reset(); wake(); } } },
  };
}
