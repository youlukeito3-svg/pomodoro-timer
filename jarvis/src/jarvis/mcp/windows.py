"""Windows を実際に触る層。

ここだけが OS に依存する。判定（safety/guard.py）も、記録も、確認の段取りも
上の層にあるので、この層は「言われたとおりに動かす」ことだけをする。
差し替えられるように口を細く保ってあり、テストでは偽物を挿す。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class WindowInfo:
    app: str | None
    title: str | None


class Desktop(Protocol):
    """PC を触るための最小限の口。"""

    def active_window(self) -> WindowInfo: ...
    def list_windows(self) -> list[WindowInfo]: ...
    def focus(self, title_contains: str) -> bool: ...
    def screenshot(self, path: Path) -> Path: ...
    def click(self, x: int, y: int, button: str = "left", double: bool = False) -> None: ...
    def move(self, x: int, y: int) -> None: ...
    def type_text(self, text: str) -> None: ...
    def hotkey(self, keys: list[str]) -> None: ...
    def scroll(self, amount: int) -> None: ...
    def screen_size(self) -> tuple[int, int]: ...
    def control_name_at(self, x: int, y: int) -> str | None: ...
    def click_control(self, name: str) -> tuple[bool, str]: ...


class WindowsDesktop:
    """pyautogui と pygetwindow でつなぐ、実物の Windows。"""

    def __init__(self) -> None:
        import pyautogui

        # 画面の隅にマウスを振り切れば止まる。最後の逃げ道として必ず有効にする。
        pyautogui.FAILSAFE = True
        # 操作と操作の間に一拍置く。速すぎると相手のアプリが取りこぼす。
        pyautogui.PAUSE = 0.15
        self._gui = pyautogui

    def active_window(self) -> WindowInfo:
        try:
            import pygetwindow as gw

            window = gw.getActiveWindow()
        except Exception:  # noqa: BLE001 - 前面が無い瞬間がある
            return WindowInfo(None, None)
        if window is None:
            return WindowInfo(None, None)
        return WindowInfo(app=_process_name(window), title=window.title or None)

    def list_windows(self) -> list[WindowInfo]:
        import pygetwindow as gw

        return [
            WindowInfo(app=_process_name(w), title=w.title)
            for w in gw.getAllWindows()
            if w.title
        ]

    def focus(self, title_contains: str) -> bool:
        import pygetwindow as gw

        for window in gw.getAllWindows():
            if title_contains.lower() in (window.title or "").lower():
                try:
                    window.activate()
                except Exception:  # noqa: BLE001 - 最小化からの復帰は失敗しうる
                    window.restore()
                    window.activate()
                return True
        return False

    def screenshot(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._gui.screenshot().save(path)
        return path

    def click(self, x: int, y: int, button: str = "left", double: bool = False) -> None:
        self._gui.click(x=x, y=y, button=button, clicks=2 if double else 1)

    def move(self, x: int, y: int) -> None:
        self._gui.moveTo(x, y, duration=0.2)

    def type_text(self, text: str) -> None:
        # 日本語は1文字ずつ打てないので、クリップボード経由で貼る。
        try:
            import pyperclip

            pyperclip.copy(text)
            self._gui.hotkey("ctrl", "v")
        except ImportError:
            self._gui.typewrite(text, interval=0.02)

    def hotkey(self, keys: list[str]) -> None:
        self._gui.hotkey(*keys)

    def scroll(self, amount: int) -> None:
        self._gui.scroll(amount)

    def screen_size(self) -> tuple[int, int]:
        size = self._gui.size()
        return int(size.width), int(size.height)

    def control_name_at(self, x: int, y: int) -> str | None:
        """その座標にある部品の名前を読む。

        座標だけでクリックすると、そこに何があるか分からないまま押すことになる。
        名前が読めれば「送信」ボタンを踏む前に気づける。
        """
        try:
            from pywinauto.uia_defines import IUIA

            element = IUIA().iuia.ElementFromPoint(_point(x, y))
            return element.CurrentName or None
        except Exception:  # noqa: BLE001 - 読めないことがある。読めなければ名前なし
            return None

    def click_control(self, name: str) -> tuple[bool, str]:
        """名前で部品を探して押す。座標のクリックより壊れにくい。"""
        try:
            from pywinauto import Desktop as UiaDesktop

            window = UiaDesktop(backend="uia").window(active_only=True)
            control = window.child_window(title=name, control_type="Button")
            if not control.exists(timeout=2):
                control = window.child_window(title_re=f".*{name}.*")
            if not control.exists(timeout=2):
                return False, f"「{name}」という部品が見つかりません"
            control.click_input()
            return True, f"「{name}」を押しました"
        except Exception as e:  # noqa: BLE001 - UI の探索は色々な形で失敗する
            return False, f"「{name}」を押せませんでした: {e}"


def _point(x: int, y: int):
    from ctypes.wintypes import POINT

    point = POINT()
    point.x, point.y = x, y
    return point


def _process_name(window) -> str | None:
    """ウィンドウから実行ファイル名を取る。許可の判定はこの名前で行う。"""
    try:
        import psutil
        import win32process

        _thread_id, pid = win32process.GetWindowThreadProcessId(window._hWnd)
        return psutil.Process(pid).name()
    except Exception:  # noqa: BLE001 - 取れないことがある。取れなければ操作しない
        return None


def screenshot_path(directory: Path, tool: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%dT%H%M%S%f")
    return directory / f"{stamp}-{tool}.png"


def create_desktop() -> Desktop:
    import os

    if os.name != "nt":
        raise RuntimeError("PC の操作は Windows でだけ動きます")
    return WindowsDesktop()
