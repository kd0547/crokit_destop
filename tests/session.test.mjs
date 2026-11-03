import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { mock, test, beforeEach, afterEach } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../electron/session.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { SessionManager } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const playlist = [{ path: "a.png", isGif: false }, { path: "b.png", isGif: false }, { path: "c.png", isGif: false }];
const baseConfig = {
  isRandom: false,
  targetCount: 0,
  durationSeconds: 60,
  observeEnabled: false,
  observeSeconds: 0,
  breaksEnabled: false,
  breakEvery: 1,
  breakSeconds: 0,
  folderId: null,
  folderName: "test",
};

let session;
beforeEach(() => {
  mock.timers.enable({ apis: ["setInterval", "Date"], now: 1_000_000 });
});
afterEach(() => {
  session?.stop();
  mock.timers.reset();
});

/** Move the clock forward one session tick (200ms) at a time, like real time. */
function advance(ms) {
  for (let t = 0; t < ms; t += 200) mock.timers.tick(Math.min(200, ms - t));
}

function start(config = {}) {
  session = new SessionManager();
  session.start(playlist, { ...baseConfig, ...config });
  return session;
}

test("extend adds time to the running clock and the phase length", () => {
  const s = start();
  advance(20_000);
  s.extend(30_000);
  const snap = s.getSnapshot();
  assert.equal(snap.state, "running");
  assert.equal(snap.remainingMs, 70_000);
  assert.equal(snap.phaseTotalMs, 90_000);
});

test("extended time is actually waited out before the image completes", () => {
  const s = start();
  s.extend(60_000);
  advance(60_000);
  assert.equal(s.getSnapshot().currentIndex, 0);
  advance(60_000);
  const snap = s.getSnapshot();
  assert.equal(snap.currentIndex, 1);
  assert.equal(snap.completedCount, 1);
  assert.equal(snap.phaseTotalMs, 60_000); // next image starts from the configured duration
});

test("resetTimer restarts the drawing clock from the configured duration", () => {
  const s = start();
  s.extend(30_000);
  advance(50_000);
  s.resetTimer();
  const snap = s.getSnapshot();
  assert.equal(snap.remainingMs, 60_000);
  assert.equal(snap.phaseTotalMs, 60_000);
});

test("extend and reset while paused change the paused remainder and stay paused", () => {
  const s = start();
  advance(10_000);
  s.pause();
  s.extend(30_000);
  advance(5_000); // time passing while paused does not count
  assert.equal(s.getSnapshot().state, "paused");
  assert.equal(s.getSnapshot().remainingMs, 80_000);
  s.resetTimer();
  assert.equal(s.getSnapshot().remainingMs, 60_000);
  s.resume();
  assert.equal(s.getSnapshot().state, "running");
  assert.equal(s.getSnapshot().remainingMs, 60_000);
});

test("observe and break clocks can be extended and reset to their own lengths", () => {
  const s = start({ observeEnabled: true, observeSeconds: 10, breaksEnabled: true, breakEvery: 1, breakSeconds: 20 });
  assert.equal(s.getSnapshot().state, "observe");
  s.extend(30_000);
  assert.equal(s.getSnapshot().remainingMs, 40_000);
  advance(5_000);
  s.resetTimer();
  assert.equal(s.getSnapshot().remainingMs, 10_000);
  advance(10_000);
  assert.equal(s.getSnapshot().state, "running");
  assert.equal(s.getSnapshot().remainingMs, 60_000); // observe extension does not leak into drawing
  advance(60_000);
  assert.equal(s.getSnapshot().state, "break");
  s.extend(60_000);
  assert.equal(s.getSnapshot().remainingMs, 80_000);
  s.resetTimer();
  assert.equal(s.getSnapshot().remainingMs, 20_000);
});

test("history minutes count the actual drawing time incl. extensions and pre-reset time", () => {
  const s = start({ targetCount: 2 });
  let finished = null;
  s.on("finished", (r) => (finished = r));
  // image 1: 60s + 60s extension
  s.extend(60_000);
  advance(120_000);
  // image 2: 30s drawn, reset, then the full 60s again -> 90s
  advance(30_000);
  s.resetTimer();
  advance(60_000);
  assert.ok(finished);
  assert.equal(finished.imagesDrawn, 2);
  assert.equal(finished.durationSeconds, 60);
  assert.equal(finished.minutes, Math.round((120 + 90) / 60));
});

test("without extensions minutes stay images x duration", () => {
  const s = start({ targetCount: 3 });
  let finished = null;
  s.on("finished", (r) => (finished = r));
  advance(180_000);
  assert.equal(finished.imagesDrawn, 3);
  assert.equal(finished.minutes, 3);
});

test("extend/reset are ignored when idle and reject bad amounts", () => {
  const s = new SessionManager();
  session = s;
  s.extend(30_000);
  s.resetTimer();
  assert.equal(s.getSnapshot().state, "idle");
  const running = start();
  running.extend(-5_000);
  running.extend(Number.NaN);
  assert.equal(running.getSnapshot().remainingMs, 60_000);
});
