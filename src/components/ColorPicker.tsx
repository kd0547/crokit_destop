import { useRef, useState } from "react";
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from "@/lib/color";

const SV_W = 196;
const SV_H = 130;
const BAR_W = 196;

const checker: React.CSSProperties = {
  backgroundImage: "repeating-conic-gradient(var(--color-neutral-800) 0% 25%, var(--color-surface-2) 0% 50%)",
  backgroundSize: "8px 8px",
};

function numInput(value: number, onCommit: (v: number) => void, max: number) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      value={Math.round(value)}
      onChange={(e) => onCommit(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
      style={{
        width: 44,
        height: 26,
        padding: "0 4px",
        borderRadius: 6,
        background: "var(--color-bg)",
        border: "1px solid var(--color-border-3)",
        color: "var(--color-text)",
        font: "500 12px var(--font-body)",
        textAlign: "center",
      }}
    />
  );
}

export function ColorPicker({
  hex,
  opacity,
  divisions,
  onPreview,
  onCommit,
  onDivisionsPreview,
  onDivisionsCommit,
}: {
  hex: string;
  opacity: number;
  divisions: number;
  onPreview: (hex: string, opacity: number) => void;
  onCommit: (hex: string, opacity: number) => void;
  onDivisionsPreview: (n: number) => void;
  onDivisionsCommit: (n: number) => void;
}) {
  const initHsv = rgbToHsv(...hexToRgb(hex));
  const [h, setH] = useState(initHsv[0]);
  const [s, setS] = useState(initHsv[1]);
  const [v, setV] = useState(initHsv[2]);
  const [op, setOp] = useState(opacity);
  const [hexText, setHexText] = useState(hex);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const opRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ h, s, v, op });
  latest.current = { h, s, v, op };

  const [r, g, b] = hsvToRgb(h, s, v);
  const curHex = rgbToHex(r, g, b);
  const hueColor = rgbToHex(...hsvToRgb(h, 1, 1));

  function push(nh: number, ns: number, nv: number, nop: number) {
    const [nr, ng, nb] = hsvToRgb(nh, ns, nv);
    const nhex = rgbToHex(nr, ng, nb);
    setHexText(nhex);
    onPreview(nhex, nop);
  }

  function commitNow() {
    const { h, s, v, op } = latest.current;
    const [nr, ng, nb] = hsvToRgb(h, s, v);
    onCommit(rgbToHex(nr, ng, nb), op);
  }

  function drag(kind: "sv" | "hue" | "op", move: (e: MouseEvent) => void) {
    const onMove = (e: MouseEvent) => move(e);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      commitNow();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function fromSv(clientX: number, clientY: number) {
    const rect = svRef.current!.getBoundingClientRect();
    const ns = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const nv = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    setS(ns);
    setV(nv);
    push(h, ns, nv, op);
  }

  function fromHue(clientX: number) {
    const rect = hueRef.current!.getBoundingClientRect();
    const nh = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * 360;
    setH(nh);
    push(nh, s, v, op);
  }

  function fromOp(clientX: number) {
    const rect = opRef.current!.getBoundingClientRect();
    const nop = Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * 100);
    setOp(nop);
    push(h, s, v, nop);
  }

  function applyHexText(text: string) {
    const m = /^#?[0-9a-fA-F]{6}$/.test(text) ? (text.startsWith("#") ? text : `#${text}`) : null;
    if (!m) return;
    const [hh, ss, vv] = rgbToHsv(...hexToRgb(m));
    setH(hh);
    setS(ss);
    setV(vv);
    onPreview(m, op);
    onCommit(m, op);
  }

  function applyRgb(nr: number, ng: number, nb: number) {
    const [hh, ss, vv] = rgbToHsv(nr, ng, nb);
    setH(hh);
    setS(ss);
    setV(vv);
    const nhex = rgbToHex(nr, ng, nb);
    setHexText(nhex);
    onPreview(nhex, op);
    onCommit(nhex, op);
  }

  function applyOpacityText(nop: number) {
    setOp(nop);
    onPreview(curHex, nop);
    onCommit(curHex, nop);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, font: "500 12px var(--font-body)", color: "var(--color-accent-200)" }}>
        <i className="ph ph-sliders-horizontal" style={{ fontSize: 14 }} />
        그리드 사용자 설정
      </div>

      {/* division count */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--color-neutral-600)", flex: "none", width: 44 }}>분할 수</span>
        <input
          type="range"
          min={2}
          max={10}
          step={1}
          value={divisions}
          onChange={(e) => onDivisionsPreview(Number(e.target.value))}
          onMouseUp={(e) => onDivisionsCommit(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => onDivisionsCommit(Number((e.target as HTMLInputElement).value))}
          style={{ flex: 1, minWidth: 0, accentColor: "var(--color-accent)" }}
        />
        {numInput(divisions, (v) => onDivisionsCommit(Math.max(2, Math.min(10, v))), 10)}
      </div>

      <div style={{ height: 1, margin: "2px 0", background: "var(--color-divider)" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 6, font: "500 12px var(--font-body)", color: "var(--color-accent-200)" }}>
        <i className="ph ph-palette" style={{ fontSize: 14 }} />
        그리드 색상
      </div>

      {/* saturation / value square */}
      <div
        ref={svRef}
        onMouseDown={(e) => {
          fromSv(e.clientX, e.clientY);
          drag("sv", (ev) => fromSv(ev.clientX, ev.clientY));
        }}
        style={{
          position: "relative",
          width: SV_W,
          height: SV_H,
          borderRadius: "var(--radius-sm)",
          cursor: "crosshair",
          backgroundColor: hueColor,
          backgroundImage: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: s * SV_W,
            top: (1 - v) * SV_H,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            borderRadius: "50%",
            border: "2px solid #fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,.5)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* hue */}
      <div
        ref={hueRef}
        onMouseDown={(e) => {
          fromHue(e.clientX);
          drag("hue", (ev) => fromHue(ev.clientX));
        }}
        style={{
          position: "relative",
          width: BAR_W,
          height: 10,
          borderRadius: 5,
          cursor: "pointer",
          background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: (h / 360) * BAR_W,
            top: "50%",
            width: 14,
            height: 14,
            marginLeft: -7,
            marginTop: -7,
            borderRadius: "50%",
            border: "2px solid #fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,.5)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* opacity */}
      <div
        ref={opRef}
        onMouseDown={(e) => {
          fromOp(e.clientX);
          drag("op", (ev) => fromOp(ev.clientX));
        }}
        style={{ position: "relative", width: BAR_W, height: 10, borderRadius: 5, cursor: "pointer", overflow: "hidden", ...checker }}
      >
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to right, transparent, ${curHex})` }} />
        <div
          style={{
            position: "absolute",
            left: (op / 100) * BAR_W,
            top: "50%",
            width: 14,
            height: 14,
            marginLeft: -7,
            marginTop: -7,
            borderRadius: "50%",
            border: "2px solid #fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,.5)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* readouts */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, flex: "none", position: "relative", overflow: "hidden", border: "1px solid var(--color-border-3)", ...checker }}>
          <div style={{ position: "absolute", inset: 0, background: curHex, opacity: op / 100 }} />
        </div>
        <input
          value={hexText}
          onChange={(e) => setHexText(e.target.value)}
          onBlur={(e) => applyHexText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyHexText((e.target as HTMLInputElement).value)}
          style={{
            flex: 1,
            minWidth: 0,
            width: 0,
            height: 26,
            padding: "0 8px",
            borderRadius: 6,
            background: "var(--color-bg)",
            border: "1px solid var(--color-border-3)",
            color: "var(--color-text)",
            font: "500 12px var(--font-body)",
            textTransform: "uppercase",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 3, flex: "none" }}>
          {numInput(op, applyOpacityText, 100)}
          <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>%</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, minWidth: 0 }}>
        {(["R", "G", "B"] as const).map((label, i) => (
          <div key={label} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--color-neutral-600)", flex: "none" }}>{label}</span>
            {numInput(i === 0 ? r : i === 1 ? g : b, (val) => applyRgb(i === 0 ? val : r, i === 1 ? val : g, i === 2 ? val : b), 255)}
          </div>
        ))}
      </div>
    </div>
  );
}
