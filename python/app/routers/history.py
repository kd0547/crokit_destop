import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .. import db
from ..models import AddHistoryRequest, HistoryEntry, PracticeImage
from ..thumbnail import save_history_thumbnail

logger = logging.getLogger("crokit")

router = APIRouter(prefix="/history", tags=["history"])


def _load_images(conn, session_ids: list[str]) -> dict[str, list[PracticeImage]]:
    images: dict[str, list[PracticeImage]] = {sid: [] for sid in session_ids}
    if not session_ids:
        return images
    placeholders = ",".join("?" * len(session_ids))
    rows = conn.execute(
        f"SELECT * FROM practice_images WHERE session_id IN ({placeholders}) ORDER BY session_id, order_index",
        session_ids,
    ).fetchall()
    for r in rows:
        d = dict(r)
        images[d.pop("session_id")].append(PracticeImage(**d))
    return images


@router.get("", response_model=list[HistoryEntry])
def list_history():
    conn = db.get_connection()
    try:
        rows = conn.execute("SELECT * FROM session_history ORDER BY created_at DESC LIMIT 50").fetchall()
        images = _load_images(conn, [r["id"] for r in rows])
        return [HistoryEntry(**dict(r), images=images[r["id"]]) for r in rows]
    finally:
        conn.close()


@router.post("", response_model=HistoryEntry)
def add_history(payload: AddHistoryRequest):
    entry_id = str(uuid.uuid4())

    conn = db.get_connection()
    try:
        folders = conn.execute("SELECT id, path FROM folders").fetchall()
    finally:
        conn.close()
    # 여러 폴더를 섞어 연습할 수 있으므로 이미지마다 자기가 속한 등록 폴더를 찾는다
    # (payload.folder_id가 있으면 그 폴더를 먼저 확인)
    roots = sorted(
        ((r["id"], Path(r["path"]).resolve()) for r in folders),
        key=lambda r: r[0] != payload.folder_id,
    )

    def find_root(src: Path) -> tuple[str | None, Path | None]:
        resolved = src.resolve()
        for folder_id, root in roots:
            if resolved.is_relative_to(root):
                return folder_id, root
        return None, None

    # 썸네일 생성은 자체 커넥션으로 thumbnails 캐시에 쓰므로, 세션 기록 트랜잭션을 열기 전에 끝낸다
    images: list[PracticeImage] = []
    for path in payload.images:
        src = Path(path)
        folder_id, folder_root = find_root(src)
        try:
            thumb_file, width, height = save_history_thumbnail(entry_id, len(images), src, folder_id, folder_root)
        except OSError:
            logger.warning("history thumbnail skipped: %s", src, exc_info=True)
            continue
        rel_path = src.resolve().relative_to(folder_root).as_posix() if folder_root else src.name
        images.append(
            PracticeImage(
                order_index=len(images), folder_id=folder_id, rel_path=rel_path,
                source_path=str(src), thumb_file=thumb_file, width=width, height=height,
            )
        )

    conn = db.get_connection()
    try:
        created_at = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO session_history (id, created_at, folder_id, folder_name, images_count, duration_seconds, minutes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (entry_id, created_at, payload.folder_id, payload.folder_name, payload.images_count, payload.duration_seconds, payload.minutes),
        )
        conn.executemany(
            """
            INSERT INTO practice_images (
                session_id, order_index, folder_id, rel_path, source_path, thumb_file, width, height
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [(entry_id, i.order_index, i.folder_id, i.rel_path, i.source_path, i.thumb_file, i.width, i.height) for i in images],
        )
        conn.commit()
        row = conn.execute("SELECT * FROM session_history WHERE id = ?", (entry_id,)).fetchone()
        return HistoryEntry(**dict(row), images=images)
    finally:
        conn.close()


@router.get("/stats")
def stats():
    conn = db.get_connection()
    try:
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        rows = conn.execute("SELECT * FROM session_history WHERE created_at >= ?", (week_ago,)).fetchall()
        sessions = len(rows)
        minutes = sum(r["minutes"] for r in rows)
        return {"sessions": sessions, "minutes": minutes}
    finally:
        conn.close()


@router.get("/{session_id}/images/{order_index}/thumbnail")
def get_practice_thumbnail(session_id: str, order_index: int):
    conn = db.get_connection()
    try:
        row = conn.execute(
            "SELECT thumb_file FROM practice_images WHERE session_id = ? AND order_index = ?", (session_id, order_index)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="image not found")
    output_path = db.HISTORY_THUMBNAIL_DIR / row["thumb_file"]
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="thumbnail not found")
    return FileResponse(output_path, media_type="image/jpeg")
