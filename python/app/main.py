import argparse
import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import db, hotkey, image_ops, security
from .routers import custom, folders, gif, history, settings, thumbnail
from .routers import hotkey as hotkey_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("crokit")


@asynccontextmanager
async def lifespan(app: FastAPI):
    security.install_log_redaction()
    db.init_db()
    conn = db.get_connection()
    try:
        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
        flip_hotkey = db.settings_row_to_dict(row)["flip_hotkey"]
    finally:
        conn.close()
    hotkey.start(asyncio.get_running_loop(), flip_hotkey)
    yield


app = FastAPI(title="crokit backend", lifespan=lifespan)

# Bound to 127.0.0.1 only (see __main__ below), but websites the user visits
# can still send requests here, so (see app/security.py):
# - every request needs the per-launch token (TokenMiddleware)
# - CORS only lets the renderer read responses: the packaged app loads from
#   file://, whose origin is "null"; the Vite dev server origin comes via env
# - TrustedHost blocks DNS rebinding (a website's own domain pointed at 127.0.0.1)
# Starlette runs the last-added middleware first: TrustedHost -> CORS -> token.
_allowed_origins = ["null"]
if os.environ.get("CROKIT_DEV_ORIGIN"):
    _allowed_origins.append(os.environ["CROKIT_DEV_ORIGIN"])

app.add_middleware(security.TokenMiddleware, token=security.API_TOKEN)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Crokit-Token"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # The original WPF app had no global exception handler at all, so any
    # error crashed the whole process. Here an unexpected error just becomes
    # a JSON 500 -- the request fails, the app keeps running.
    logger.exception("Unhandled error for %s %s", request.method, request.url)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(custom.router)
@app.get("/files")
def get_file(path: str):
    # images in registered folders, plus extracted GIF frames
    p = security.resolve_allowed(path, extra_roots=[db.FRAMES_DIR])
    if not image_ops.is_image(p):
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(p)


app.include_router(folders.router)
app.include_router(gif.router)
app.include_router(history.router)
app.include_router(hotkey_router.router)
app.include_router(settings.router)
app.include_router(thumbnail.router)


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=58090)
    args = parser.parse_args()

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
