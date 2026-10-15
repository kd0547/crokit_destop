from typing import Optional

from pydantic import BaseModel


class DurationPreset(BaseModel):
    seconds: int
    isUser: bool = False


class CountPreset(BaseModel):
    count: int
    isUser: bool = False


class Hotkey(BaseModel):
    vk: int                     # Windows 가상 키 코드 (F4 = 115)
    ctrl: bool = False
    alt: bool = False
    shift: bool = False
    label: str                  # 화면 표시용, 예: "Ctrl+F4"


class FolderSelectionItem(BaseModel):
    folder_id: str
    rel_path: str = ""          # 등록 폴더 기준 하위 폴더 (posix, "" = 등록 폴더 자체)
    recursive: bool = True      # True = 하위 폴더 포함, False = 그 폴더에 직접 있는 이미지만


class SettingsOut(BaseModel):
    window_width: float
    window_height: float
    window_x: Optional[float]
    window_y: Optional[float]
    panel_open: bool
    always_on_top: bool
    auto_hide: bool
    sound: bool
    gray: bool
    flip: bool
    grid: bool
    grid_color: str
    grid_opacity: int
    grid_divisions: int
    order_mode: str
    duration_seconds: int
    duration_presets: list[DurationPreset]
    count: int
    count_presets: list[CountPreset]
    observe_enabled: bool
    observe_seconds: int
    observe_presets: list[DurationPreset]
    breaks_enabled: bool
    break_every: int
    break_seconds: int
    current_folder_id: Optional[str]
    folder_selection: list[FolderSelectionItem] = []
    flip_hotkey: Optional[Hotkey] = None


class SettingsUpdate(BaseModel):
    window_width: Optional[float] = None
    window_height: Optional[float] = None
    window_x: Optional[float] = None
    window_y: Optional[float] = None
    panel_open: Optional[bool] = None
    always_on_top: Optional[bool] = None
    auto_hide: Optional[bool] = None
    sound: Optional[bool] = None
    gray: Optional[bool] = None
    flip: Optional[bool] = None
    grid: Optional[bool] = None
    grid_color: Optional[str] = None
    grid_opacity: Optional[int] = None
    grid_divisions: Optional[int] = None
    order_mode: Optional[str] = None
    duration_seconds: Optional[int] = None
    duration_presets: Optional[list[DurationPreset]] = None
    count: Optional[int] = None
    count_presets: Optional[list[CountPreset]] = None
    observe_enabled: Optional[bool] = None
    observe_seconds: Optional[int] = None
    observe_presets: Optional[list[DurationPreset]] = None
    breaks_enabled: Optional[bool] = None
    break_every: Optional[int] = None
    break_seconds: Optional[int] = None
    current_folder_id: Optional[str] = None
    folder_selection: Optional[list[FolderSelectionItem]] = None
    flip_hotkey: Optional[Hotkey] = None


class FolderNode(BaseModel):
    rel_path: str               # 등록 폴더 기준 상대경로 (posix, 루트는 "")
    name: str
    count: int                  # 이 폴더에 직접 있는 이미지 수
    total: int                  # 하위 폴더 포함 이미지 수
    samples: list[str] = []     # 표지용 이미지 절대경로 (최대 3장, 직접 이미지 우선)
    children: list["FolderNode"] = []


class FolderOut(BaseModel):
    id: str
    name: str
    path: str
    order_index: int
    count: int                  # 하위 폴더 포함 이미지 수 (= tree.total)
    tree: FolderNode


class AddFolderRequest(BaseModel):
    path: str
    name: Optional[str] = None


class FolderFile(BaseModel):
    path: str
    name: str
    is_gif: bool
    folder_id: Optional[str] = None  # 이 파일이 속한 등록 폴더 (썸네일 조회용)


class FolderFilesRequest(BaseModel):
    items: list[FolderSelectionItem]


class PracticeImage(BaseModel):
    order_index: int            # 세션 안에서 보여준 순서 (0부터)
    folder_id: Optional[str]    # 폴더가 삭제돼도 기록은 남으므로 참조만 보관
    rel_path: str               # 폴더 루트 기준 상대경로
    source_path: str            # 원본 절대경로 (원본 보기용, 지금은 없을 수도 있음)
    thumb_file: str             # HISTORY_THUMBNAIL_DIR 기준 상대경로
    width: int                  # 썸네일 크기
    height: int


class HistoryEntry(BaseModel):
    id: str
    created_at: str
    folder_id: Optional[str]
    folder_name: str
    images_count: int
    duration_seconds: int
    minutes: int
    images: list[PracticeImage] = []


class AddHistoryRequest(BaseModel):
    folder_id: Optional[str] = None
    folder_name: str
    images_count: int
    duration_seconds: int
    minutes: int
    images: list[str] = []      # 연습한 이미지 절대경로, 보여준 순서대로