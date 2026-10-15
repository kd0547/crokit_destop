import hashlib
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

from . import db
from . import image_ops


THUMBNAIL_WIDTH = 300
THUMBNAIL_HEIGHT = 300


def thumbnail(folder_id: str, folder_root: Path):
    # 1. 대상 이미지 파일 탐색
    img_files = [
        p for p in folder_root.rglob("*") if image_ops.is_image(p) and p.is_file()
    ]
    if not img_files:
        return None

    # 2. 썸네일 순회 생성 (이미 최신인 썸네일은 건너뜀)
    for img in img_files:
        get_or_create_thumbnail(folder_id, folder_root, img)

    return None


def get_or_create_thumbnail(folder_id: str, folder_root: Path, src: Path) -> Path:
    """원본에 대한 최신 썸네일 경로를 반환. 없거나 원본이 바뀌었으면 새로 생성.

    src가 folder_root 밖이면 ValueError.
    """
    rel_path = src.resolve().relative_to(folder_root.resolve()).as_posix()
    st = src.stat()

    conn = db.get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM thumbnails WHERE folder_id = ? AND rel_path = ?", (folder_id, rel_path)
        ).fetchone()
        if row and row["source_mtime"] == st.st_mtime and row["source_size"] == st.st_size:
            output_path = db.THUMBNAIL_DIR / row["thumb_file"]
            if output_path.exists():
                return output_path

        # 2. 썸네일 저장 경로 생성 (상대경로 해시로 이름 충돌 방지)
        thumb_file = f"{folder_id}/{hashlib.sha1(rel_path.encode('utf-8')).hexdigest()}.jpg"
        output_path = db.THUMBNAIL_DIR / thumb_file
        output_path.parent.mkdir(parents=True, exist_ok=True)
        width, height = _create_thumbnail(src, output_path)

        conn.execute(
            """
            INSERT OR REPLACE INTO thumbnails (
                folder_id, rel_path, source_mtime, source_size, thumb_file, width, height, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (folder_id, rel_path, st.st_mtime, st.st_size, thumb_file, width, height,
             datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        return output_path
    finally:
        conn.close()


def save_history_thumbnail(
    session_id: str, order_index: int, src: Path, folder_id: str | None, folder_root: Path | None
) -> tuple[str, int, int]:
    """히스토리용 썸네일을 HISTORY_THUMBNAIL_DIR에 저장하고 (thumb_file, width, height) 반환.

    폴더 썸네일 캐시가 있으면 복사해서 재사용 (없으면 캐시도 같이 생성됨).
    원본을 열 수 없으면 OSError.
    """
    thumb_file = f"{session_id}/{order_index}.jpg"
    output_path = db.HISTORY_THUMBNAIL_DIR / thumb_file
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if folder_id and folder_root:
        try:
            shutil.copyfile(get_or_create_thumbnail(folder_id, folder_root, src), output_path)
            with Image.open(output_path) as img:
                return thumb_file, img.width, img.height
        except ValueError:
            pass  # 폴더 밖 파일 -> 캐시 없이 직접 생성

    width, height = _create_thumbnail(src, output_path)
    return thumb_file, width, height


def delete_folder_thumbnails(folder_id: str) -> None:
    # DB 행은 folders 삭제 시 ON DELETE CASCADE로 함께 삭제됨
    shutil.rmtree(db.THUMBNAIL_DIR / folder_id, ignore_errors=True)


def _create_thumbnail(image_path: Path, output_path: Path) -> tuple[int, int]:
    with Image.open(image_path) as img:
        # 스마트폰 사진 회전 정보(EXIF) 자동 보정
        img = ImageOps.exif_transpose(img)

        # 투명 배경(RGBA, LA, P)일 경우 흰색 배경 합성 후 RGB 변환
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            img = img.convert("RGBA")
            background = Image.new("RGBA", img.size, (255, 255, 255, 255))
            img = Image.alpha_composite(background, img).convert("RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # 썸네일 축소 및 저장
        img.thumbnail((THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT))
        img.save(output_path, "JPEG", quality=85)
        return img.size
