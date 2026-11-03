"""Access-control tests: start the real backend and call it like a website would.

Run from python/:  .venv/Scripts/python -m unittest discover -s tests -v
"""

import base64
import json
import os
import socket
import time
from urllib.parse import quote

from PIL import Image

from backend_case import TOKEN, BackendTestCase


class SecurityTest(BackendTestCase):
    @classmethod
    def make_files(cls):
        cls.outside = cls.tmp / "private"
        cls.outside.mkdir()

        cls.inside_png = cls.folder / "pose.png"
        Image.new("RGB", (40, 30), "red").save(cls.inside_png)
        frames = [Image.new("RGB", (20, 20), c) for c in ("red", "blue")]
        cls.inside_gif = cls.folder / "move.gif"
        frames[0].save(cls.inside_gif, save_all=True, append_images=frames[1:], duration=100)
        (cls.folder / "notes.txt").write_text("not an image")

        cls.outside_png = cls.outside / "secret.png"
        Image.new("RGB", (40, 30), "blue").save(cls.outside_png)
        cls.outside_gif = cls.outside / "secret.gif"
        frames[0].save(cls.outside_gif, save_all=True, append_images=frames[1:], duration=100)

    # --- token ---------------------------------------------------------------

    def test_health_is_public(self):
        self.assertEqual(self.get("/health", token=None)[0], 200)

    def test_requests_without_token_are_rejected(self):
        self.assertEqual(self.get("/settings", token=None)[0], 401)
        self.assertEqual(self.get("/settings", token="wrong")[0], 401)
        self.assertEqual(self.get(f"/settings?t=wrong", token=None)[0], 401)
        self.assertEqual(self.get(f"/files?path={quote(str(self.inside_png))}", token=None)[0], 401)
        status, _, _ = self.request("POST", "/folders", token=None, body={"path": str(self.outside)})
        self.assertEqual(status, 401)

    def test_token_in_header_or_query(self):
        self.assertEqual(self.get("/settings")[0], 200)
        self.assertEqual(self.get(f"/settings?t={TOKEN}", token=None)[0], 200)

    def test_token_is_masked_in_logs(self):
        self.assertEqual(self.get(f"/settings?t={TOKEN}", token=None)[0], 200)
        self.assertEqual(self.ws_handshake(f"/hotkey/ws?t={TOKEN}"), 101)
        time.sleep(0.5)  # let the backend flush its log lines
        log = self.log_path.read_text(encoding="utf-8", errors="replace")
        self.assertIn("t=***", log)
        self.assertNotIn(TOKEN, log)

    def test_foreign_host_header_is_rejected(self):
        # DNS rebinding: a website's own domain pointed at 127.0.0.1
        self.assertEqual(self.get("/settings", headers={"Host": "evil.example"})[0], 400)

    def test_cors_only_allows_the_app_origin(self):
        preflight = {"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-crokit-token"}
        _, _, res = self.request("OPTIONS", "/settings", token=None, headers={"Origin": "https://evil.example", **preflight})
        self.assertIsNone(res.getheader("access-control-allow-origin"))
        _, _, res = self.request("OPTIONS", "/settings", token=None, headers={"Origin": "null", **preflight})
        self.assertEqual(res.getheader("access-control-allow-origin"), "null")

    def test_websocket_needs_token(self):
        self.assertNotEqual(self.ws_handshake("/hotkey/ws"), 101)
        self.assertEqual(self.ws_handshake(f"/hotkey/ws?t={TOKEN}"), 101)

    def ws_handshake(self, path) -> int:
        key = base64.b64encode(os.urandom(16)).decode()
        with socket.create_connection(("127.0.0.1", self.port), timeout=10) as s:
            s.sendall(
                f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nUpgrade: websocket\r\n"
                f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode()
            )
            status_line = s.recv(1024).split(b"\r\n", 1)[0]
        return int(status_line.split()[1])

    # --- paths ---------------------------------------------------------------

    def file(self, path):
        return self.get(f"/files?path={quote(str(path))}")[0]

    def test_files_only_inside_registered_folders(self):
        self.assertEqual(self.file(self.inside_png), 200)
        self.assertEqual(self.file(self.outside_png), 404)
        self.assertEqual(self.file(self.folder / ".." / "private" / "secret.png"), 404)
        self.assertEqual(self.file(self.folder / "notes.txt"), 404)
        self.assertEqual(self.file(self.folder / "missing.png"), 404)
        self.assertEqual(self.file(r"\\127.0.0.1\c$\secret.png"), 404)

    def test_gif_frames_only_inside_registered_folders(self):
        self.assertEqual(self.get(f"/gif/frames?path={quote(str(self.outside_gif))}")[0], 404)
        status, body = self.get(f"/gif/frames?path={quote(str(self.inside_gif))}")
        self.assertEqual(status, 200)
        frames = json.loads(body)["frames"]
        self.assertEqual(len(frames), 2)
        # extracted frames live in the data dir and must stay viewable
        self.assertEqual(self.file(frames[0]), 200)

    def test_thumbnail_only_inside_registered_folders(self):
        url = f"/thumbnail/file?folder_id={self.folder_id}&path="
        self.assertEqual(self.get(url + quote(str(self.inside_png)))[0], 200)
        self.assertEqual(self.get(url + quote(str(self.outside_png)))[0], 404)

    def test_history_skips_outside_images(self):
        status, body, _ = self.request("POST", "/history", body={
            "folder_id": self.folder_id, "folder_name": "refs", "images_count": 2,
            "duration_seconds": 60, "minutes": 1,
            "images": [str(self.inside_png), str(self.outside_png)],
        })
        self.assertEqual(status, 200, body)
        sources = [i["source_path"] for i in json.loads(body)["images"]]
        self.assertEqual(sources, [str(self.inside_png)])


if __name__ == "__main__":
    unittest.main()
