"""GIF frame extraction, used by the in-app GIF scrubber.

Frames are cached under a directory keyed by a hash of the GIF's own
absolute path, so the same file scanned from any folder always resolves to
the same cache -- no collisions, no dependency on a persisted "image id"
(there isn't one anymore; folders are scanned live, not imported).

Uses Pillow's ImageSequence iterator, which composites each frame according
to the GIF's own disposal method internally.
"""

import hashlib
from pathlib import Path

from PIL import Image, ImageSequence

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".webp", ".gif"}


def is_gif(path: Path) -> bool:
    return path.suffix.lower() == ".gif"


def is_image(path: Path) -> bool:
    return path.suffix.lower() in IMAGE_EXTENSIONS


def path_cache_key(path: Path) -> str:
    return hashlib.sha1(str(path.resolve()).encode("utf-8")).hexdigest()


def split_gif(src_path: Path, frames_root: Path) -> list[Path]:
    dest_dir = frames_root / path_cache_key(src_path)
    if dest_dir.exists() and any(dest_dir.iterdir()):
        return sorted(dest_dir.iterdir())

    dest_dir.mkdir(parents=True, exist_ok=True)
    frame_paths: list[Path] = []
    with Image.open(src_path) as im:
        for i, frame in enumerate(ImageSequence.Iterator(im)):
            out_path = dest_dir / f"frame_{i:03d}.png"
            frame.convert("RGBA").save(out_path)
            frame_paths.append(out_path)
    return frame_paths
