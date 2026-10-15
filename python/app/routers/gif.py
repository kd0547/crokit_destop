from pathlib import Path

from fastapi import APIRouter, HTTPException

from .. import db, image_ops

router = APIRouter(prefix="/gif", tags=["gif"])


@router.get("/frames")
def get_frames(path: str):
    src = Path(path)
    if not src.exists() or not src.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    frames = image_ops.split_gif(src, db.FRAMES_DIR)
    return {"frames": [str(p) for p in frames]}
