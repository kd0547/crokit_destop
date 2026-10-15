from fastapi import APIRouter

from .. import db, hotkey
from ..models import SettingsOut, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_settings():
    conn = db.get_connection()
    try:
        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
        return db.settings_row_to_dict(row)
    finally:
        conn.close()


@router.put("", response_model=SettingsOut)
def update_settings(payload: SettingsUpdate):
    conn = db.get_connection()
    try:
        fields = payload.model_dump(exclude_unset=True)
        if fields:
            columns, values = db.settings_update_values(fields)
            set_clause = ", ".join(f"{c} = ?" for c in columns)
            conn.execute(f"UPDATE settings SET {set_clause} WHERE id = 1", values)
            conn.commit()
            if "flip_hotkey" in fields:
                hotkey.set_flip_hotkey(fields["flip_hotkey"])

        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
        return db.settings_row_to_dict(row)
    finally:
        conn.close()
