import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from fastapi import APIRouter, HTTPException

from .. import db, image_ops
from ..models import AddFolderRequest, FolderFile, FolderFilesRequest, FolderNode, FolderOut
from ..thumbnail import delete_folder_thumbnails

router = APIRouter(prefix="/folders", tags=["folders"])

SAMPLE_COUNT = 3
MAX_DEPTH = 16  # 심볼릭 링크/정션 외의 비정상적으로 깊은 구조 방어용


def _skip_dir(entry: os.DirEntry) -> bool:
    # 숨김/시스템 폴더와 링크(정션 포함)는 따라가지 않음 -- 순환 참조 방지
    if entry.name.startswith(".") or entry.name.startswith("$"):
        return True
    if entry.is_symlink() or (hasattr(entry, "is_junction") and entry.is_junction()):
        return True
    return not entry.is_dir(follow_symlinks=False)


def _list_dir(path: Path) -> tuple[list[Path], list[Path]]:
    """(이미지 파일, 하위 폴더) -- 이름순(대소문자 무시)."""
    files: list[Path] = []
    dirs: list[Path] = []
    try:
        with os.scandir(path) as it:
            for entry in it:
                try:
                    if entry.is_file() and image_ops.is_image(Path(entry.name)):
                        files.append(Path(entry.path))
                    elif not _skip_dir(entry):
                        dirs.append(Path(entry.path))
                except OSError:
                    continue
    except OSError:
        return [], []
    key = lambda p: p.name.lower()
    return sorted(files, key=key), sorted(dirs, key=key)


def _iter_images(path: Path, recursive: bool, depth: int = 0) -> Iterator[Path]:
    """직접 이미지 먼저, 그다음 하위 폴더를 이름순으로 -- 트리 표시 순서와 같음."""
    files, dirs = _list_dir(path)
    yield from files
    if recursive and depth < MAX_DEPTH:
        for d in dirs:
            yield from _iter_images(d, True, depth + 1)


def _build_tree(path: Path, rel_path: str, depth: int = 0) -> FolderNode:
    files, dirs = _list_dir(path)
    children = []
    if depth < MAX_DEPTH:
        for d in dirs:
            child = _build_tree(d, f"{rel_path}/{d.name}" if rel_path else d.name, depth + 1)
            if child.total > 0:  # 이미지가 하나도 없는 가지는 숨김
                children.append(child)
    samples = [str(p) for p in files[:SAMPLE_COUNT]]
    for c in children:
        if len(samples) >= SAMPLE_COUNT:
            break
        samples.extend(c.samples[: SAMPLE_COUNT - len(samples)])
    return FolderNode(
        rel_path=rel_path,
        name=path.name or str(path),
        count=len(files),
        total=len(files) + sum(c.total for c in children),
        samples=samples,
        children=children,
    )


def _resolve_in_root(root: Path, rel_path: str) -> Path:
    """등록 폴더 안의 하위 폴더 경로. 밖을 가리키면 400."""
    target = (root / rel_path).resolve() if rel_path else root.resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="등록 폴더 밖의 경로입니다")
    return target


def _row_to_out(row) -> FolderOut:
    path = Path(row["path"])
    tree = _build_tree(path, "") if path.is_dir() else FolderNode(rel_path="", name=row["name"], count=0, total=0)
    tree.name = row["name"]
    return FolderOut(id=row["id"], name=row["name"], path=row["path"], order_index=row["order_index"], count=tree.total, tree=tree)


def _get_row(conn, folder_id: str):
    row = conn.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="folder not found")
    return row


@router.get("", response_model=list[FolderOut])
def list_folders():
    conn = db.get_connection()
    try:
        rows = conn.execute("SELECT * FROM folders ORDER BY order_index ASC").fetchall()
    finally:
        conn.close()
    return [_row_to_out(r) for r in rows]


@router.post("", response_model=FolderOut)
def add_folder(payload: AddFolderRequest):
    path = Path(payload.path)
    if not path.exists() or not path.is_dir():
        raise HTTPException(status_code=400, detail="폴더를 찾을 수 없습니다")

    conn = db.get_connection()
    try:
        existing = conn.execute("SELECT * FROM folders").fetchall()
        for r in existing:
            if Path(r["path"]).resolve() == path.resolve():
                raise HTTPException(status_code=409, detail="이미 등록된 폴더입니다")
        next_order = (conn.execute("SELECT COALESCE(MAX(order_index), 0) AS m FROM folders").fetchone())["m"] + 1
        folder_id = str(uuid.uuid4())
        name = payload.name or path.name or str(path)
        conn.execute(
            "INSERT INTO folders (id, name, path, order_index, created_at) VALUES (?, ?, ?, ?, ?)",
            (folder_id, name, str(path), next_order, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        row = _get_row(conn, folder_id)
    finally:
        conn.close()
    return _row_to_out(row)


@router.delete("/{folder_id}")
def delete_folder(folder_id: str):
    conn = db.get_connection()
    try:
        deleted = conn.execute("DELETE FROM folders WHERE id = ?", (folder_id,)).rowcount
        conn.execute("UPDATE settings SET current_folder_id = NULL WHERE current_folder_id = ?", (folder_id,))
        # 이 폴더를 가리키는 선택 항목도 정리
        row = conn.execute("SELECT folder_selection FROM settings WHERE id = 1").fetchone()
        selection = [s for s in json.loads(row["folder_selection"]) if s.get("folder_id") != folder_id]
        conn.execute("UPDATE settings SET folder_selection = ? WHERE id = 1", (json.dumps(selection),))
        conn.commit()
        # 실제 등록된 폴더일 때만 썸네일 디렉터리 삭제 (임의 folder_id로 다른 경로를 지우지 않도록)
        if deleted:
            delete_folder_thumbnails(folder_id)
        return {"ok": True}
    finally:
        conn.close()


@router.get("/{folder_id}/files", response_model=list[FolderFile])
def list_files(folder_id: str, rel_path: str = "", recursive: bool = False):
    """등록 폴더(또는 그 하위 폴더)의 이미지. 기본은 직접 들어있는 것만."""
    conn = db.get_connection()
    try:
        row = _get_row(conn, folder_id)
    finally:
        conn.close()
    target = _resolve_in_root(Path(row["path"]), rel_path)
    return [FolderFile(path=str(p), name=p.name, is_gif=image_ops.is_gif(p), folder_id=folder_id) for p in _iter_images(target, recursive)]


@router.post("/files", response_model=list[FolderFile])
def list_selection_files(payload: FolderFilesRequest):
    """여러 폴더 선택을 하나의 재생 목록으로 (선택 순서 → 폴더 트리 순서, 중복 제거)."""
    conn = db.get_connection()
    try:
        rows = {r["id"]: r for r in conn.execute("SELECT * FROM folders").fetchall()}
    finally:
        conn.close()

    seen: set[str] = set()
    out: list[FolderFile] = []
    for item in payload.items:
        row = rows.get(item.folder_id)
        if row is None:
            continue
        target = _resolve_in_root(Path(row["path"]), item.rel_path)
        for p in _iter_images(target, item.recursive):
            key = str(p)
            if key in seen:
                continue
            seen.add(key)
            out.append(FolderFile(path=key, name=p.name, is_gif=image_ops.is_gif(p), folder_id=item.folder_id))
    return out
