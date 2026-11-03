import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import { randomBytes } from "node:crypto";

const API_HOST = "127.0.0.1";
const START_ATTEMPTS = 3;

let pythonProcess: ChildProcessWithoutNullStreams | null = null;
let apiBase = "";

/**
 * Per-launch secret the backend requires on every request (python/app/security.py).
 * Websites the user visits can reach 127.0.0.1 too; they can't know this.
 */
const apiToken = randomBytes(32).toString("base64url");

/** Backend address for this run. Set by startPythonBackend; the port changes every launch. */
export function getApiBase(): string {
  return apiBase;
}

export function getApiToken(): string {
  return apiToken;
}

/** Headers for the main process's own backend calls. */
export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "X-Crokit-Token": apiToken, ...extra };
}

function resolvePythonRoot(appRoot: string): string {
  // Dev: <project>/python. Packaged: resources/python (see package.json extraResources).
  const packaged = path.join(process.resourcesPath ?? "", "python");
  if (fs.existsSync(packaged)) return packaged;
  return path.join(appRoot, "python");
}

function resolvePythonExe(pythonRoot: string): string {
  const venvPython = path.join(pythonRoot, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(venvPython)) return venvPython;
  return process.platform === "win32" ? "python" : "python3";
}

// Packaged: PyInstaller-frozen backend (npm run python:build), see package.json extraResources.
function resolveFrozenBackend(): string | null {
  const exe = path.join(process.resourcesPath ?? "", "backend", "crokit-backend.exe");
  return fs.existsSync(exe) ? exe : null;
}

/** Ask the OS for a free port. Another process could grab it before the backend binds, so the caller retries. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, API_HOST, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function spawnBackend(appRoot: string, dataDir: string, port: number): ChildProcessWithoutNullStreams {
  const env: NodeJS.ProcessEnv = { ...process.env, CROKIT_DATA_DIR: dataDir, CROKIT_TOKEN: apiToken };
  // dev: the renderer is served by Vite, so its origin must pass the backend's CORS check
  if (process.env.VITE_DEV_SERVER_URL) env.CROKIT_DEV_ORIGIN = new URL(process.env.VITE_DEV_SERVER_URL).origin;
  const args = ["--port", String(port)];
  const frozen = resolveFrozenBackend();

  if (frozen) {
    return spawn(frozen, args, { cwd: path.dirname(frozen), env, windowsHide: true });
  }
  const pythonRoot = resolvePythonRoot(appRoot);
  const pythonExe = resolvePythonExe(pythonRoot);
  return spawn(pythonExe, ["-m", "app.main", ...args], { cwd: pythonRoot, env, windowsHide: true });
}

export async function startPythonBackend(appRoot: string, dataDir: string): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= START_ATTEMPTS; attempt++) {
    const port = await findFreePort();
    apiBase = `http://${API_HOST}:${port}`;

    const proc = spawnBackend(appRoot, dataDir, port);
    pythonProcess = proc;
    proc.stdout.on("data", (chunk) => console.log(`[python] ${chunk}`));
    proc.stderr.on("data", (chunk) => console.error(`[python] ${chunk}`));
    // always keep an "error" listener: an unhandled one would crash the main process
    proc.on("error", (err) => console.error("python backend process error:", err));
    proc.on("exit", (code) => {
      console.log(`python backend exited with code ${code}`);
      if (pythonProcess === proc) pythonProcess = null;
    });

    try {
      await waitForHealth(proc);
      return;
    } catch (err) {
      lastError = err;
      console.error(`python backend start attempt ${attempt} failed:`, err);
      proc.kill();
      if (pythonProcess === proc) pythonProcess = null;
    }
  }
  throw lastError;
}

/** Resolves once /health answers. Rejects early if the process dies (e.g. the port was taken in the meantime). */
function waitForHealth(proc: ChildProcessWithoutNullStreams, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      proc.off("exit", onExit);
      proc.off("error", onError);
      if (err) reject(err);
      else resolve();
    };
    const onExit = (code: number | null) => finish(new Error(`Python backend exited before becoming healthy (code ${code})`));
    const onError = (err: Error) => finish(err);
    proc.on("exit", onExit);
    proc.on("error", onError);

    const tryOnce = () => {
      if (done) return;
      const req = http.get(`${apiBase}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) finish();
        else retry();
      });
      req.on("error", retry);
    };
    const retry = () => {
      if (done) return;
      if (Date.now() - start > timeoutMs) {
        finish(new Error("Python backend did not become healthy in time"));
        return;
      }
      setTimeout(tryOnce, 250);
    };
    tryOnce();
  });
}

export function stopPythonBackend(): void {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
}
