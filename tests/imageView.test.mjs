import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/imageView.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { fitImage, constrainView, rotateAt, rotationDelta, zoomAt, initialImageView } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const image = { width: 1600, height: 800 };
const viewport = { width: 800, height: 600 };

test("100% fits the unrotated image and preserves its aspect ratio", () => {
  assert.deepEqual(fitImage(image, viewport), { width: 800, height: 400 });
  assert.deepEqual(fitImage({ width: 800, height: 1600 }, viewport), { width: 300, height: 600 });
});

test("zoom preserves the image point beneath the cursor", () => {
  const previous = { zoom: 2, rotation: 0, x: 30, y: -20 };
  const next = zoomAt(previous, 1.5, 100, 50, image, viewport);
  assert.equal((100 - next.x) / next.zoom, (100 - previous.x) / previous.zoom);
  assert.equal((50 - next.y) / next.zoom, (50 - previous.y) / previous.zoom);
});

test("canvas can pan at 100% but retains a visible strip at its limits", () => {
  const moved = { ...initialImageView, x: 100, y: -100 };
  assert.deepEqual(constrainView(moved, image, viewport), moved);
  const normal = constrainView({ zoom: 2, rotation: 0, x: 9999, y: -9999 }, image, viewport);
  assert.equal(normal.x, 1152);
  assert.equal(normal.y, -652);
  const rotated = constrainView({ zoom: 2, rotation: 90, x: 9999, y: -9999 }, image, viewport);
  assert.equal(rotated.x, 752);
  assert.equal(rotated.y, -1052);
});

test("zoom is limited and shrinking the viewport reclamps the pan", () => {
  assert.equal(zoomAt(initialImageView, 1e6, 0, 0, image, viewport).zoom, 12);
  assert.equal(zoomAt(initialImageView, 1e-6, 0, 0, image, viewport).zoom, 0.25);
  const small = constrainView({ zoom: 2, rotation: 0, x: 9999, y: 9999 }, image, { width: 400, height: 300 });
  assert.equal(small.x, 552);
  assert.equal(small.y, 302);
  assert.deepEqual(fitImage(image, { width: 0, height: 0 }), { width: 0, height: 0 });
});

test("free rotation preserves zoom and allows panning to the clipped edges", () => {
  for (const rotation of [0.5, 15, 45, 89.5, 90, 120, 225, 359.5]) {
    const view = constrainView({ zoom: 1, rotation, x: 0, y: 0 }, image, viewport);
    assert.equal(view.zoom, 1);
    assert.equal(view.rotation, rotation);
    assert.deepEqual(fitImage(image, viewport), { width: 800, height: 400 });
  }
  // A quarter turn retains the original 800px long edge; it is not shrunk
  // to the 600px viewport height, and its overflow remains reachable by pan.
  const quarterTurn = constrainView({ zoom: 1, rotation: 90, x: 9999, y: 9999 }, image, viewport);
  assert.equal(quarterTurn.x, 552);
  assert.equal(quarterTurn.y, 652);
  const panned = constrainView({ zoom: 2, rotation: 45, x: 9999, y: -9999 }, image, viewport);
  assert.ok(Math.abs(panned.x - (600 * Math.SQRT2 + 400 - 48)) < 1e-6);
  assert.ok(Math.abs(panned.y + (600 * Math.SQRT2 + 300 - 48)) < 1e-6);
});

function imagePoint(view, screen) {
  const radians = -view.rotation * Math.PI / 180;
  const x = screen.x - view.x;
  const y = screen.y - view.y;
  return { x: (x * Math.cos(radians) - y * Math.sin(radians)) / view.zoom, y: (x * Math.sin(radians) + y * Math.cos(radians)) / view.zoom };
}

function assertSamePoint(actual, expected) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-8);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-8);
}

test("rotation fixes the viewport center even after pan and zoom", () => {
  const previous = { zoom: 2.3, rotation: 337, x: 240, y: -76 };
  const center = { x: 0, y: 0 };
  const next = rotateAt(previous, 37);
  assert.equal(next.zoom, previous.zoom);
  assert.equal(next.rotation, 14);
  assertSamePoint(imagePoint(next, center), imagePoint(previous, center));
  assert.ok(Math.abs(Math.hypot(next.x, next.y) - Math.hypot(previous.x, previous.y)) < 1e-8);
});

test("a centered image never follows the mouse during a full drag rotation", () => {
  let view = initialImageView;
  let pointer = { x: 100, y: 0 };
  for (let i = 0; i < 72; i++) {
    const radians = (i + 1) * 5 * Math.PI / 180;
    const nextPointer = { x: 100 * Math.cos(radians), y: 100 * Math.sin(radians) };
    view = rotateAt(view, rotationDelta(pointer, nextPointer));
    assertSamePoint(view, { x: 0, y: 0 });
    pointer = nextPointer;
  }
  assert.ok(Math.min(view.rotation, 360 - view.rotation) < 1e-8);
  assert.equal(view.zoom, 1);
});

test("wheel zoom still anchors to the cursor after viewport-centered rotation", () => {
  const pivot = { x: 150, y: 80 };
  const rotated = rotateAt(initialImageView, 90);
  const zoomed = zoomAt(rotated, 1.1, pivot.x, pivot.y, image, viewport);
  assertSamePoint(imagePoint(zoomed, pivot), imagePoint(rotated, pivot));
});

test("pointer angle uses viewport center rather than horizontal distance", () => {
  assert.equal(rotationDelta({ x: 100, y: 0 }, { x: 0, y: 100 }), 90);
  assert.equal(rotationDelta({ x: 0, y: 100 }, { x: 100, y: 0 }), -90);
  assert.equal(rotationDelta({ x: 100, y: 0 }, { x: 200, y: 0 }), 0);
  const point = (degrees) => ({ x: 100 * Math.cos(degrees * Math.PI / 180), y: 100 * Math.sin(degrees * Math.PI / 180) });
  assert.ok(Math.abs(rotationDelta(point(179), point(-179)) - 2) < 1e-8);
});

test("pointer motion near the viewport pivot does not cause angle jumps", () => {
  assert.equal(rotationDelta({ x: 1, y: 0 }, { x: -1, y: 0 }), 0);
  assert.equal(rotationDelta({ x: 100, y: 0 }, { x: 0, y: 0 }), 0);
  assert.equal(rotationDelta({ x: 0, y: 0 }, { x: 100, y: 0 }), 0);
});
