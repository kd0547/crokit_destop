"""Global (focus-independent) hotkey for flipping the image.

A low-level keyboard hook (WH_KEYBOARD_LL) only *observes* key presses and
passes every key on (CallNextHookEx), so the app in front -- e.g. Photoshop
bound to the same key -- still receives it. RegisterHotKey is not used on
purpose: it swallows the key.

The hook runs on its own thread with a Win32 message loop; matches are handed
to the asyncio loop and pushed to every connected /hotkey/ws client.
"""

import asyncio
import ctypes
import logging
import threading
from ctypes import wintypes
from typing import Any, Optional

logger = logging.getLogger("crokit.hotkey")

WH_KEYBOARD_LL = 13
WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP = 0x0100, 0x0101, 0x0104, 0x0105
VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN = 0x10, 0x11, 0x12, 0x5B, 0x5C
# the hook sees left/right variants for modifiers, never the generic ones
MODIFIER_VKS = {0x10, 0x11, 0x12, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, VK_LWIN, VK_RWIN}

LRESULT = ctypes.c_ssize_t
HOOKPROC = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)


class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ("vkCode", wintypes.DWORD),
        ("scanCode", wintypes.DWORD),
        ("flags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_size_t),
    ]


_hotkey: Optional[dict[str, Any]] = None  # {"vk", "ctrl", "alt", "shift", "label"} or None
_loop: Optional[asyncio.AbstractEventLoop] = None
_clients: set[asyncio.Queue] = set()
_thread: Optional[threading.Thread] = None


def set_flip_hotkey(hotkey: Optional[dict[str, Any]]) -> None:
    global _hotkey
    _hotkey = hotkey if hotkey and hotkey.get("vk") else None


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _clients.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _clients.discard(q)


def _broadcast(message: str) -> None:
    for q in list(_clients):
        q.put_nowait(message)


def start(loop: asyncio.AbstractEventLoop, hotkey: Optional[dict[str, Any]]) -> None:
    global _loop, _thread
    set_flip_hotkey(hotkey)
    _loop = loop
    if _thread is not None or not hasattr(ctypes, "windll"):
        return
    _thread = threading.Thread(target=_hook_thread, name="crokit-hotkey", daemon=True)
    _thread.start()


def _hook_thread() -> None:
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    user32.SetWindowsHookExW.argtypes = [ctypes.c_int, HOOKPROC, wintypes.HINSTANCE, wintypes.DWORD]
    user32.SetWindowsHookExW.restype = ctypes.c_void_p
    user32.CallNextHookEx.argtypes = [ctypes.c_void_p, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM]
    user32.CallNextHookEx.restype = LRESULT
    user32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
    user32.GetAsyncKeyState.argtypes = [ctypes.c_int]
    user32.GetAsyncKeyState.restype = ctypes.c_short
    kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
    kernel32.GetModuleHandleW.restype = wintypes.HMODULE

    def is_down(vk: int) -> bool:
        return bool(user32.GetAsyncKeyState(vk) & 0x8000)

    held: set[int] = set()  # to drop auto-repeat while a key is held

    # Runs inside the system's input path: keep it short, Windows silently
    # removes a hook that takes too long (LowLevelHooksTimeout).
    def proc(n_code: int, w_param: int, l_param: int) -> int:
        if n_code == 0:
            vk = ctypes.cast(l_param, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents.vkCode
            if w_param in (WM_KEYUP, WM_SYSKEYUP):
                held.discard(vk)
            elif w_param in (WM_KEYDOWN, WM_SYSKEYDOWN) and vk not in held:
                held.add(vk)
                hk = _hotkey
                if (
                    hk is not None
                    and vk == hk["vk"]
                    and vk not in MODIFIER_VKS
                    # modifiers must match exactly: plain F4 must not fire on Ctrl+F4 / Alt+F4
                    and is_down(VK_CONTROL) == bool(hk.get("ctrl"))
                    and is_down(VK_MENU) == bool(hk.get("alt"))
                    and is_down(VK_SHIFT) == bool(hk.get("shift"))
                    and not (is_down(VK_LWIN) or is_down(VK_RWIN))
                    and _loop is not None
                ):
                    _loop.call_soon_threadsafe(_broadcast, "flip")
        # always pass the key on so the focused app still gets it
        return user32.CallNextHookEx(None, n_code, w_param, l_param)

    callback = HOOKPROC(proc)  # keep a reference for the lifetime of the hook
    hook = user32.SetWindowsHookExW(WH_KEYBOARD_LL, callback, kernel32.GetModuleHandleW(None), 0)
    if not hook:
        logger.error("keyboard hook install failed (error %s)", ctypes.get_last_error())
        return
    logger.info("keyboard hook installed")

    msg = wintypes.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))
