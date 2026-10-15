import argparse
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import db, hotkey
from .routers import folders, gif, history, settings, thumbnail
from .routers import hotkey as hotkey_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("crokit")


@asynccontextmanager
async def lifespan(app: FastAPI):
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

# Fully local desktop app (server is bound to 127.0.0.1 only, see __main__ below),
# so a permissive CORS policy for the Electron renderer origin is fine here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/files")
def get_file(path: str):
    p = Path(path)
    if not p.exists() or not p.is_file():
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
