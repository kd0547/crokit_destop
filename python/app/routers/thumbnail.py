from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .. import db, image_ops
from ..thumbnail import get_or_create_thumbnail, thumbnail

router = APIRouter(prefix="/thumbnail", tags=["folders"])


def _get_folder(folder_id: str):
    conn = db.get_connection()
    try:
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone()
    finally:
        conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="folder not found")
    return row


@router.get("/create")
def create_thumbnail(folder_id: str):
    folder = _get_folder(folder_id)
    thumbnail(folder["id"], Path(folder["path"]))
    return {"ok": True}


@router.get("/file")
def get_thumbnail(folder_id: str, path: str):
    folder = _get_folder(folder_id)
    src = Path(path)
    if not src.is_file() or not image_ops.is_image(src):
        raise HTTPException(status_code=404, detail="file not found")

    try:
        output_path = get_or_create_thumbnail(folder["id"], Path(folder["path"]), src)
    except ValueError:
        # 등록된 폴더 밖의 파일
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(output_path, media_type="image/jpeg")
