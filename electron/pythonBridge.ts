import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";

export const API_PORT = 58090;
export const API_BASE = `http://127.0.0.1:${API_PORT}`;

let pythonProcess: ChildProcessWithoutNullStreams | null = null;

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

export function startPythonBackend(appRoot: string, dataDir: string): Promise<void> {
  const env = { ...process.env, CROKIT_DATA_DIR: dataDir };
  const frozen = resolveFrozenBackend();

  if (frozen) {
    pythonProcess = spawn(frozen, ["--port", String(API_PORT)], { cwd: path.dirname(frozen), env, windowsHide: true });
  } else {
    const pythonRoot = resolvePythonRoot(appRoot);
    const pythonExe = resolvePythonExe(pythonRoot);
    pythonProcess = spawn(pythonExe, ["-m", "app.main", "--port", String(API_PORT)], { cwd: pythonRoot, env, windowsHide: true });
  }

  pythonProcess.stdout.on("data", (chunk) => console.log(`[python] ${chunk}`));
  pythonProcess.stderr.on("data", (chunk) => console.error(`[python] ${chunk}`));
  pythonProcess.on("error", (err) => {
    console.error("Failed to start python backend:", err);
  });
  pythonProcess.on("exit", (code) => {
    console.log(`python backend exited with code ${code}`);
    pythonProcess = null;
  });

  return waitForHealth();
}

function waitForHealth(timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(`${API_BASE}/health`, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          resolve();
        } else {
          res.resume();
          retry();
        }
      });
      req.on("error", retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Python backend did not become healthy in time"));
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
