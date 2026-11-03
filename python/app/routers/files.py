"""Serve local source images and extracted GIF frames to the renderer."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/files", tags=["files"])


@router.get("")
def get_file(path: str):
    source = Path(path)
    if not source.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(source)
