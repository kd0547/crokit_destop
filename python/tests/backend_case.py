"""Shared harness: start the real backend on a free port with a temp data dir.

Subclasses override make_files() to put test images in cls.folder (registered
as a library folder before the tests run) or elsewhere under cls.tmp.
Uses only the standard library (plus Pillow from requirements.txt).
"""

import http.client
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

PYTHON_ROOT = Path(__file__).resolve().parent.parent
TOKEN = "test-token-123"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class BackendTestCase(unittest.TestCase):
    @classmethod
    def make_files(cls):
        """Create test files; cls.tmp and cls.folder already exist."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="crokit-test-"))
        cls.folder = cls.tmp / "refs"
        cls.folder.mkdir()
        cls.make_files()

        cls.port = free_port()
        env = {**os.environ, "CROKIT_DATA_DIR": str(cls.tmp / "data"), "CROKIT_TOKEN": TOKEN}
        cls.log_path = cls.tmp / "backend.log"
        cls.log_file = open(cls.log_path, "wb")
        cls.proc = subprocess.Popen(
            [sys.executable, "-m", "app.main", "--port", str(cls.port)],
            cwd=PYTHON_ROOT, env=env, stdout=cls.log_file, stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.time() + 20
            while True:
                try:
                    if cls.request("GET", "/health", token=None)[0] == 200:
                        break
                except OSError:
                    pass
                if time.time() > deadline:
                    raise RuntimeError("backend did not start")
                time.sleep(0.2)

            status, body, _ = cls.request("POST", "/folders", body={"path": str(cls.folder)})
            assert status == 200, (status, body)
            cls.folder_id = json.loads(body)["id"]
        except BaseException:
            cls.tearDownClass()  # unittest skips tearDownClass when setUpClass fails
            raise

    @classmethod
    def tearDownClass(cls):
        if sys.platform == "win32":
            # a venv python.exe runs the real interpreter as a child; kill the whole tree
            subprocess.run(["taskkill", "/PID", str(cls.proc.pid), "/T", "/F"], capture_output=True)
        else:
            cls.proc.terminate()
        cls.proc.wait(timeout=10)
        cls.log_file.close()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    @classmethod
    def request(cls, method, path, token=TOKEN, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", cls.port, timeout=10)
        h = dict(headers or {})
        if token:
            h["X-Crokit-Token"] = token
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            h["Content-Type"] = "application/json"
        try:
            conn.request(method, path, body=data, headers=h)
            res = conn.getresponse()
            return res.status, res.read(), res
        finally:
            conn.close()

    def get(self, path, **kw):
        status, body, _ = self.request("GET", path, **kw)
        return status, body
