"""SQLite storage for crokit.

v2 schema: folder-based photo sources (register a directory, scan it live)
instead of a manually curated per-file workspace. Everything lives in a
single db file under CROKIT_DATA_DIR (set by Electron to
app.getPath('userData'); falls back to python/.data for standalone runs).
init_db() is called unconditionally at FastAPI startup (see app/main.py).
"""

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

_DATA_DIR = Path(os.environ.get("CROKIT_DATA_DIR", Path(__file__).resolve().parent.parent / ".data"))
_DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = _DATA_DIR / "crokit.db"
FRAMES_DIR = _DATA_DIR / "frames"
FRAMES_DIR.mkdir(parents=True, exist_ok=True)
THUMBNAIL_DIR = _DATA_DIR / "thumbnails"
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
# copies kept per history session, so a session's images survive folder removal
# and source edits (THUMBNAIL_DIR is a cache that gets invalidated/cleared)
HISTORY_THUMBNAIL_DIR = _DATA_DIR / "history_thumbnails"
HISTORY_THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)


DEFAULT_DURATION_PRESETS = [{"seconds": 30}, {"seconds": 60}, {"seconds": 120}, {"seconds": 300}, {"seconds": 600}]
DEFAULT_COUNT_PRESETS = [{"count": 10}, {"count": 20}, {"count": 30}]
DEFAULT_OBSERVE_PRESETS = [{"seconds": 5}, {"seconds": 10}, {"seconds": 15}, {"seconds": 30}]

DEFAULT_SETTINGS: dict[str, Any] = {
    "window_width": 1180,
    "window_height": 760,
    "window_x": None,
    "window_y": None,
    "panel_open": True,
    "always_on_top": False,
    "auto_hide": True,
    "sound": True,
    "gray": False,
    "flip": False,
    "grid": False,
    "grid_color": "#e9e9ed",
    "grid_opacity": 18,
    "grid_divisions": 3,
    "order_mode": "random",
    "duration_seconds": 60,
    "duration_presets": DEFAULT_DURATION_PRESETS,
    "count": 20,
    "count_presets": DEFAULT_COUNT_PRESETS,
    "observe_enabled": False,
    "observe_seconds": 10,
    "observe_presets": DEFAULT_OBSERVE_PRESETS,
    "breaks_enabled": False,
    "break_every": 10,
    "break_seconds": 30,
    "current_folder_id": None,
    # [{"folder_id", "rel_path", "recursive"}] -- 재생할 폴더 선택 (models.FolderSelectionItem)
    "folder_selection": [],
    # {"vk", "ctrl", "alt", "shift", "label"} -- see app/hotkey.py
    "flip_hotkey": None,
}

_JSON_FIELDS = {"duration_presets", "count_presets", "observe_presets", "flip_hotkey", "folder_selection"}
_BOOL_FIELDS = {"panel_open", "always_on_top", "auto_hide", "sound", "gray", "flip", "grid", "observe_enabled", "breaks_enabled"}


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        observe_presets_ddl = f"TEXT NOT NULL DEFAULT '{json.dumps(DEFAULT_OBSERVE_PRESETS)}'"
        conn.executescript(
            f"""
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                window_width REAL, window_height REAL,
                window_x REAL, window_y REAL,
                panel_open INTEGER NOT NULL DEFAULT 1,
                always_on_top INTEGER NOT NULL DEFAULT 0,
                auto_hide INTEGER NOT NULL DEFAULT 1,
                sound INTEGER NOT NULL DEFAULT 1,
                gray INTEGER NOT NULL DEFAULT 0,
                flip INTEGER NOT NULL DEFAULT 0,
                grid INTEGER NOT NULL DEFAULT 0,
                grid_color TEXT NOT NULL DEFAULT '#e9e9ed',
                grid_opacity INTEGER NOT NULL DEFAULT 18,
                grid_divisions INTEGER NOT NULL DEFAULT 3,
                order_mode TEXT NOT NULL DEFAULT 'random',
                duration_seconds INTEGER NOT NULL DEFAULT 60,
                duration_presets TEXT NOT NULL DEFAULT '[]',
                count INTEGER NOT NULL DEFAULT 20,
                count_presets TEXT NOT NULL DEFAULT '[]',
                observe_enabled INTEGER NOT NULL DEFAULT 0,
                observe_seconds INTEGER NOT NULL DEFAULT 10,
                observe_presets {observe_presets_ddl},
                breaks_enabled INTEGER NOT NULL DEFAULT 0,
                break_every INTEGER NOT NULL DEFAULT 10,
                break_seconds INTEGER NOT NULL DEFAULT 30,
                current_folder_id TEXT,
                folder_selection TEXT NOT NULL DEFAULT '[]',
                flip_hotkey TEXT NOT NULL DEFAULT 'null'
            );

            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                order_index INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS session_history (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                folder_name TEXT NOT NULL,
                images_count INTEGER NOT NULL,
                duration_seconds INTEGER NOT NULL,
                minutes INTEGER NOT NULL
            );

            -- one row per generated thumbnail; source_mtime/size detect a changed
            -- original, thumb_file is relative to THUMBNAIL_DIR (<folder_id>/<sha1>.jpg)
            CREATE TABLE IF NOT EXISTS thumbnails (
                folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
                rel_path TEXT NOT NULL,
                source_mtime REAL NOT NULL,
                source_size INTEGER NOT NULL,
                thumb_file TEXT NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (folder_id, rel_path)
            );

            -- images practiced in a history session, in display order. folder_id has
            -- no FK on purpose: history outlives a removed folder. thumb_file is
            -- relative to HISTORY_THUMBNAIL_DIR (<session_id>/<order_index>.jpg)
            CREATE TABLE IF NOT EXISTS practice_images (
                session_id TEXT NOT NULL REFERENCES session_history(id) ON DELETE CASCADE,
                order_index INTEGER NOT NULL,
                folder_id TEXT,
                rel_path TEXT NOT NULL,
                source_path TEXT NOT NULL,
                thumb_file TEXT NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                PRIMARY KEY (session_id, order_index)
            );
            """
        )
        history_cols = {r["name"] for r in conn.execute("PRAGMA table_info(session_history)").fetchall()}
        if "folder_id" not in history_cols:
            conn.execute("ALTER TABLE session_history ADD COLUMN folder_id TEXT")
        # migrate columns added after a settings table already existed on disk
        # (CREATE TABLE IF NOT EXISTS does not alter an existing table)
        existing_cols = {r["name"] for r in conn.execute("PRAGMA table_info(settings)").fetchall()}
        migrations = {
            "grid_color": "TEXT NOT NULL DEFAULT '#e9e9ed'",
            "grid_opacity": "INTEGER NOT NULL DEFAULT 18",
            "grid_divisions": "INTEGER NOT NULL DEFAULT 3",
            "observe_enabled": "INTEGER NOT NULL DEFAULT 0",
            "observe_seconds": "INTEGER NOT NULL DEFAULT 10",
            "observe_presets": observe_presets_ddl,
            "always_on_top": "INTEGER NOT NULL DEFAULT 0",
            "flip_hotkey": "TEXT NOT NULL DEFAULT 'null'",
            "folder_selection": "TEXT NOT NULL DEFAULT '[]'",
        }
        for col, ddl in migrations.items():
            if col not in existing_cols:
                conn.execute(f"ALTER TABLE settings ADD COLUMN {col} {ddl}")

        row = conn.execute("SELECT COUNT(*) AS c FROM settings WHERE id = 1").fetchone()
        if row["c"] == 0:
            s = DEFAULT_SETTINGS
            conn.execute(
                """
                INSERT INTO settings (
                    id, window_width, window_height, window_x, window_y,
                    panel_open, always_on_top, auto_hide, sound, gray, flip, grid, grid_color, grid_opacity, grid_divisions, order_mode,
                    duration_seconds, duration_presets, count, count_presets,
                    observe_enabled, observe_seconds, observe_presets,
                    breaks_enabled, break_every, break_seconds, current_folder_id
                ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    s["window_width"], s["window_height"], s["window_x"], s["window_y"],
                    int(s["panel_open"]), int(s["always_on_top"]), int(s["auto_hide"]), int(s["sound"]),
                    int(s["gray"]), int(s["flip"]), int(s["grid"]), s["grid_color"], s["grid_opacity"], s["grid_divisions"], s["order_mode"],
                    s["duration_seconds"], json.dumps(s["duration_presets"]),
                    s["count"], json.dumps(s["count_presets"]),
                    int(s["observe_enabled"]), s["observe_seconds"], json.dumps(s["observe_presets"]),
                    int(s["breaks_enabled"]), s["break_every"], s["break_seconds"], s["current_folder_id"],
                ),
            )
        conn.commit()
    finally:
        conn.close()


def settings_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    for k in _BOOL_FIELDS:
        d[k] = bool(d[k])
    for k in _JSON_FIELDS:
        d[k] = json.loads(d[k])
    return d


def settings_update_values(fields: dict[str, Any]) -> tuple[list[str], list[Any]]:
    columns, values = [], []
    for k, v in fields.items():
        columns.append(k)
        if k in _BOOL_FIELDS:
            values.append(int(v))
        elif k in _JSON_FIELDS:
            values.append(json.dumps(v))
        else:
            values.append(v)
    return columns, values
