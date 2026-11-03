from fastapi import APIRouter, HTTPException

from .. import db, image_ops, security

router = APIRouter(prefix="/gif", tags=["gif"])


@router.get("/frames")
def get_frames(path: str):
    src = security.resolve_allowed(path)
    if not image_ops.is_gif(src):
        raise HTTPException(status_code=404, detail="file not found")
    frames = image_ops.split_gif(src, db.FRAMES_DIR)
    return {"frames": [str(p) for p in frames]}
