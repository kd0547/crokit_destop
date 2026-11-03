"""App-managed "커스텀" folders and the images dropped into them.

Each custom folder is a folders row with kind = 'custom' whose files live in
db.CUSTOM_DIR/<folder id>/. Its name is only stored in the db, so renaming is a
plain UPDATE. Unlike linked folders, only custom folders can be renamed.

The renderer sends each dropped image as the raw request body (no multipart, so
no python-multipart dependency); the original file name goes in the query.
"""

import hashlib
import io
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from .. import db, image_ops
from ..models import CustomFolderRequest, FolderOut
from .folders import _get_row, _row_to_out

router = APIRouter(prefix="/custom", tags=["custom"])

MAX_BYTES = 200 * 1024 * 1024
MAX_NAME = 60
# Pillow format -> extension we save under (first entry is the default)
_FORMAT_EXTS = {
    "PNG": (".png",),
    "JPEG": (".jpg", ".jpeg"),
    "MPO": (".jpg", ".jpeg"),  # multi-picture JPEG from some cameras
    "BMP": (".bmp",),
    "WEBP": (".webp",),
    "GIF": (".gif",),
}
_INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


class CustomImageOut(BaseModel):
    folder_id: str
    path: str
    name: str
    duplicate: bool  # same image was already in the folder; nothing new was written


# ---------- folders ----------


def _clean_name(name: Optional[str]) -> str:
    cleaned = " ".join((name or "").split())[:MAX_NAME]
    if not cleaned:
        raise HTTPException(status_code=400, detail="폴더 이름을 입력하세요")
    return cleaned


def _unique_default_name(conn) -> str:
    taken = {r["name"] for r in conn.execute("SELECT name FROM folders").fetchall()}
    name, n = db.CUSTOM_FOLDER_NAME, 1
    while name in taken:
        n += 1
        name = f"{db.CUSTOM_FOLDER_NAME} {n}"
    return name


def _create_folder(conn, name: Optional[str]) -> str:
    folder_id = str(uuid.uuid4())
    (db.CUSTOM_DIR / folder_id).mkdir(parents=True, exist_ok=True)
    next_order = conn.execute("SELECT COALESCE(MAX(order_index), 0) AS m FROM folders").fetchone()["m"] + 1
    conn.execute(
        "INSERT INTO folders (id, name, path, order_index, created_at, kind) VALUES (?, ?, ?, ?, ?, 'custom')",
        (folder_id, _clean_name(name) if name is not None else _unique_default_name(conn), str(db.CUSTOM_DIR / folder_id), next_order, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    return folder_id


def _custom_row(conn, folder_id: str):
    row = _get_row(conn, folder_id)
    if row["kind"] != "custom":
        raise HTTPException(status_code=400, detail="커스텀 폴더만 이름을 바꾸거나 그림을 넣을 수 있습니다")
    return row


@router.post("/folders", response_model=FolderOut)
def create_folder(payload: CustomFolderRequest):
    conn = db.get_connection()
    try:
        row = _get_row(conn, _create_folder(conn, payload.name))
    finally:
        conn.close()
    return _row_to_out(row)


@router.patch("/folders/{folder_id}", response_model=FolderOut)
def rename_folder(folder_id: str, payload: CustomFolderRequest):
    conn = db.get_connection()
    try:
        _custom_row(conn, folder_id)
        conn.execute("UPDATE folders SET name = ? WHERE id = ?", (_clean_name(payload.name), folder_id))
        conn.commit()
        row = _get_row(conn, folder_id)
    finally:
        conn.close()
    return _row_to_out(row)


# ---------- images ----------


def _detect_ext(data: bytes) -> tuple[str, ...]:
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = im.format
            im.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise HTTPException(status_code=415, detail="이미지 파일이 아닙니다")
    exts = _FORMAT_EXTS.get(fmt or "")
    if not exts:
        raise HTTPException(status_code=415, detail=f"지원하지 않는 이미지 형식입니다 ({fmt})")
    return exts


def _safe_name(filename: str, exts: tuple[str, ...]) -> str:
    name = _INVALID_CHARS.sub("_", Path(filename.replace("\\", "/")).name).strip(" .")
    stem, suffix = Path(name).stem.strip(" ."), Path(name).suffix.lower()
    if not stem or stem.startswith((".", "$")):
        stem = "image"
    return f"{stem[:120]}{suffix if suffix in exts else exts[0]}"


def _find_duplicate(folder: Path, data: bytes) -> Path | None:
    digest = hashlib.sha1(data).digest()
    for p in folder.iterdir():
        try:
            if p.is_file() and image_ops.is_image(p) and p.stat().st_size == len(data) and hashlib.sha1(p.read_bytes()).digest() == digest:
                return p
        except OSError:
            continue
    return None


def _target_folder(folder_id: Optional[str]) -> tuple[str, Path]:
    """The custom folder to drop into: the given one, else the first custom folder (created if none)."""
    conn = db.get_connection()
    try:
        if folder_id:
            row = _custom_row(conn, folder_id)
        else:
            row = conn.execute("SELECT * FROM folders WHERE kind = 'custom' ORDER BY order_index ASC LIMIT 1").fetchone()
            if row is None:
                row = _get_row(conn, _create_folder(conn, None))
    finally:
        conn.close()
    path = Path(row["path"])
    path.mkdir(parents=True, exist_ok=True)
    return row["id"], path


def _save(filename: str, data: bytes, folder_id: Optional[str]) -> CustomImageOut:
    exts = _detect_ext(data)
    folder_id, folder = _target_folder(folder_id)

    existing = _find_duplicate(folder, data)
    if existing is not None:
        return CustomImageOut(folder_id=folder_id, path=str(existing), name=existing.name, duplicate=True)

    name = _safe_name(filename, exts)
    stem, suffix = Path(name).stem, Path(name).suffix
    # write to a temp file first so a half-written image never shows up in a scan
    tmp = folder / f".upload-{uuid.uuid4().hex}"
    tmp.write_bytes(data)
    try:
        for n in range(1, 10_000):
            target = folder / (name if n == 1 else f"{stem} ({n}){suffix}")
            if target.exists():
                continue
            try:
                tmp.rename(target)  # fails if target appeared meanwhile (Windows)
            except FileExistsError:
                continue
            return CustomImageOut(folder_id=folder_id, path=str(target), name=target.name, duplicate=False)
    finally:
        tmp.unlink(missing_ok=True)
    raise HTTPException(status_code=409, detail="같은 이름의 파일이 너무 많습니다")


@router.post("/images", response_model=CustomImageOut)
async def add_image(request: Request, filename: str = "image", folder_id: Optional[str] = None):
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="빈 파일입니다")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="파일이 너무 큽니다 (최대 200MB)")
    return await run_in_threadpool(_save, filename, data, folder_id)
