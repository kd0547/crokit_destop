"""Access control for the local API.

The backend only listens on 127.0.0.1, but any website the user visits can
still send requests there. Two layers keep the user's files private:

1. TokenMiddleware: every request must carry the per-launch token Electron
   generates (env CROKIT_TOKEN). Fetches send it as the X-Crokit-Token header;
   <img src> and WebSocket URLs can't set headers, so they use ?t=.
2. resolve_allowed(): endpoints that serve a file by path only serve files
   inside a registered folder.
"""

import logging
import os
import re
import secrets
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qs

from fastapi import HTTPException

from . import db

logger = logging.getLogger("crokit")

TOKEN_HEADER = b"x-crokit-token"
TOKEN_QUERY = "t"
PUBLIC_PATHS = {"/health"}


def _load_token() -> str:
    token = os.environ.get("CROKIT_TOKEN")
    if token:
        return token
    # standalone run (python -m app.main) without Electron
    token = secrets.token_urlsafe(32)
    logger.warning("CROKIT_TOKEN not set; generated a token for this run: %s", token)
    return token


API_TOKEN = _load_token()


class TokenMiddleware:
    """Rejects HTTP requests (401) and WebSocket connections (close 1008) without the token."""

    def __init__(self, app, token: str):
        self.app = app
        self.token = token.encode()

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket") or scope["path"] in PUBLIC_PATHS or self._authorized(scope):
            await self.app(scope, receive, send)
            return

        if scope["type"] == "websocket":
            await receive()  # websocket.connect
            await send({"type": "websocket.close", "code": 1008})
            return

        body = b'{"detail":"unauthorized"}'
        await send({
            "type": "http.response.start",
            "status": 401,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        })
        await send({"type": "http.response.body", "body": body})

    def _authorized(self, scope) -> bool:
        for key, value in scope.get("headers", []):
            if key == TOKEN_HEADER:
                return secrets.compare_digest(value, self.token)
        values = parse_qs(scope.get("query_string", b"").decode("latin-1")).get(TOKEN_QUERY)
        return bool(values) and secrets.compare_digest(values[0].encode(), self.token)


_TOKEN_IN_URL = re.compile(r"([?&]t=)[^&\s\"']+")


class RedactTokenFilter(logging.Filter):
    """Masks ?t=<token> in uvicorn's request logs (<img src> and WebSocket URLs carry it)."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(_TOKEN_IN_URL.sub(r"\1***", a) if isinstance(a, str) else a for a in record.args)
        return True


def install_log_redaction() -> None:
    # called at startup, after uvicorn has configured its loggers
    for name in ("uvicorn.access", "uvicorn.error"):
        logging.getLogger(name).addFilter(RedactTokenFilter())


def _registered_roots() -> list[str]:
    conn = db.get_connection()
    try:
        return [r["path"] for r in conn.execute("SELECT path FROM folders").fetchall()]
    finally:
        conn.close()


def _within(path: Path, roots: Iterable[Path]) -> bool:
    return any(path.is_relative_to(root) for root in roots)


def resolve_allowed(raw: str, extra_roots: Iterable[Path] = ()) -> Path:
    """Resolved path of `raw` if it is a file inside a registered folder (or one of extra_roots).

    Anything else -- missing file, outside path, folder -- gets the same 404, so
    a caller can't probe which files exist. The plain path is checked first,
    without touching the disk, so e.g. a UNC share path is rejected before
    anything tries to open it; it's checked again after resolve() so a symlink
    inside a folder can't point outside it.
    """
    not_found = HTTPException(status_code=404, detail="file not found")
    if not raw:
        raise not_found

    # roots are folders the user registered, so resolving them is safe. Folder
    # listings return resolved paths, so a root registered through a junction
    # has to match in both forms.
    roots = [Path(os.path.abspath(r)) for r in [*_registered_roots(), *extra_roots]]
    try:
        resolved_roots = [r.resolve() for r in roots]
    except (OSError, RuntimeError):
        raise not_found
    plain = Path(os.path.abspath(raw))
    if not _within(plain, [*roots, *resolved_roots]):
        raise not_found

    try:
        resolved = plain.resolve(strict=True)
    except (OSError, RuntimeError):
        raise not_found
    if not _within(resolved, resolved_roots) or not resolved.is_file():
        raise not_found
    return resolved
