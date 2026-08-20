"""手。安全装置が本当に効くかを、Windows 無しで確かめる。

ここが緩むと PC が壊れる。だから「動くこと」より「止まること」を厚く見る。
"""

from pathlib import Path

import pytest

from jarvis.config import load_config
from jarvis.mcp.hands import Hands
from jarvis.mcp.windows import WindowInfo
from jarvis.memory import db
from jarvis.safety.panic import PanicSwitch


class FakeDesktop:
    """PC のふり。何を頼まれたかを覚えるだけで、何もしない。"""

    def __init__(self, app: str | None = "chrome.exe", title: str = "検索",
                 label: str | None = None) -> None:
        self.window = WindowInfo(app=app, title=title)
        self.label = label
        self.calls: list[tuple] = []

    def active_window(self) -> WindowInfo:
        return self.window

    def list_windows(self) -> list[WindowInfo]:
        return [self.window]

    def focus(self, title_contains: str) -> bool:
        self.calls.append(("focus", title_contains))
        return True

    def screenshot(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"png")
        self.calls.append(("screenshot", str(path)))
        return path

    def click(self, x: int, y: int, button: str = "left", double: bool = False) -> None:
        self.calls.append(("click", x, y, button, double))

    def move(self, x: int, y: int) -> None:
        self.calls.append(("move", x, y))

    def type_text(self, text: str) -> None:
        self.calls.append(("type", text))

    def hotkey(self, keys: list[str]) -> None:
        self.calls.append(("hotkey", tuple(keys)))

    def scroll(self, amount: int) -> None:
        self.calls.append(("scroll", amount))

    def screen_size(self) -> tuple[int, int]:
        return (1920, 1080)

    def control_name_at(self, x: int, y: int) -> str | None:
        return self.label

    def click_control(self, name: str) -> tuple[bool, str]:
        self.calls.append(("click_control", name))
        return True, f"「{name}」を押しました"

    def did(self, kind: str) -> bool:
        return any(c[0] == kind for c in self.calls)


@pytest.fixture()
def config(tmp_path):
    cfg = load_config()
    cfg.paths.data_dir = str(tmp_path)
    cfg.hands.confirm_ttl_sec = 1
    cfg.hands.screenshot_on_action = False
    cfg.ensure_dirs()
    return cfg


def build(config, desktop=None, ask_voice=None):
    desktop = desktop or FakeDesktop()
    conn = db.connect(config.paths.db, embed_dim=config.memory.embed_dim)
    hands = Hands(config, desktop=desktop, conn=conn, ask_voice=ask_voice)
    return hands, desktop, conn


def decisions(conn) -> list[str]:
    return [r["decision"] for r in conn.execute("SELECT decision FROM action_log ORDER BY id")]


# ---------------------------------------------------------------- 通る道


def test_許可アプリなら押せる(config) -> None:
    hands, desktop, conn = build(config)
    assert "押しました" in hands.click_at(100, 200)
    assert ("click", 100, 200, "left", False) in desktop.calls
    assert decisions(conn) == ["allowed"]


def test_画面を見るのはいつでもできる(config) -> None:
    hands, desktop, _ = build(config, FakeDesktop(app=None, title=None))
    assert "保存しました" in hands.screenshot()
    assert desktop.did("screenshot")


# ---------------------------------------------------------------- 止まる道


def test_未許可アプリでは指一本動かさない(config) -> None:
    hands, desktop, conn = build(config, FakeDesktop(app="steam.exe"))
    result = hands.click_at(10, 10)
    assert "できません" in result
    assert not desktop.did("click")
    assert decisions(conn) == ["denied"]


def test_禁止アプリでは指一本動かさない(config) -> None:
    hands, desktop, _ = build(config, FakeDesktop(app="regedit.exe"))
    hands.type_text("何か")
    assert not desktop.did("type")


def test_前面が分からなければ動かさない(config) -> None:
    hands, desktop, _ = build(config, FakeDesktop(app=None))
    assert "できません" in hands.click_at(1, 1)
    assert not desktop.did("click")


def test_危険な画面では許可アプリでも動かさない(config) -> None:
    hands, desktop, _ = build(config, FakeDesktop(title="ネットバンキング ログイン"))
    hands.click_at(5, 5)
    assert not desktop.did("click")


def test_緊急停止中は何も動かさない(config) -> None:
    PanicSwitch(config.paths.data).engage("テスト")
    hands, desktop, conn = build(config)
    result = hands.click_at(1, 1)
    assert "緊急停止" in result and "jarvis resume" in result
    assert not desktop.did("click")
    assert decisions(conn) == ["denied"]


def test_緊急停止を解けばまた動く(config) -> None:
    switch = PanicSwitch(config.paths.data)
    switch.engage("テスト")
    hands, desktop, _ = build(config)
    hands.click_at(1, 1)
    switch.release()
    hands.click_at(2, 2)
    assert desktop.did("click")


# ---------------------------------------------------------------- 確認する道


def test_取り返しのつかない操作は確認を取ってから動く(config) -> None:
    asked: list[str] = []
    hands, desktop, conn = build(config, FakeDesktop(label="送信"))

    def ask(question: str) -> None:
        asked.append(question)
        hands.answer_confirmation(True)   # 声で「はい」と答えた

    hands.ask_voice = ask
    result = hands.click_at(50, 60)

    assert asked and "送信" in asked[0]
    assert desktop.did("click")
    assert "押しました" in result
    assert decisions(conn) == ["confirmed"]


def test_断れば実行しない(config) -> None:
    hands, desktop, conn = build(config, FakeDesktop(label="削除"))
    hands.ask_voice = lambda _q: hands.answer_confirmation(False)
    result = hands.click_at(50, 60)
    assert not desktop.did("click")
    assert "実行しませんでした" in result
    assert decisions(conn) == ["denied"]


def test_返事が無ければ実行しない(config) -> None:
    """尋ねたまま放置された操作が、あとから動きだしてはいけない。"""
    hands, desktop, _ = build(config, FakeDesktop(label="購入"), ask_voice=lambda _q: None)
    result = hands.click_at(50, 60)
    assert not desktop.did("click")
    assert "確認が取れなかった" in result


def test_尋ねる口が無ければ実行しない(config) -> None:
    """黙って実行するより、実行しないほうが安全側に倒れている。"""
    hands, desktop, _ = build(config, FakeDesktop(label="送信"))
    assert "確認が取れなかった" in hands.click_at(50, 60)
    assert not desktop.did("click")


def test_パスワードらしき入力も確認を取る(config) -> None:
    hands, desktop, _ = build(config)
    hands.ask_voice = lambda _q: hands.answer_confirmation(False)
    hands.type_text("パスワードは hunter2 です")
    assert not desktop.did("type")


def test_名前で押す場合も名前を見て判断する(config) -> None:
    hands, desktop, _ = build(config)
    hands.ask_voice = lambda _q: hands.answer_confirmation(False)
    hands.click_control("注文を確定する")
    assert not desktop.did("click_control")


def test_ふつうのボタンは黙って押す(config) -> None:
    asked: list[str] = []
    hands, desktop, _ = build(config, FakeDesktop(label="次へ"), ask_voice=asked.append)
    hands.click_at(10, 10)
    assert asked == []
    assert desktop.did("click")


# ---------------------------------------------------------------- 返事の受け口


def test_確認待ちが無ければ返事は宙に浮く(config) -> None:
    hands, _, _ = build(config)
    assert hands.answer_confirmation(True) is None


def test_一つの返事で二つの操作は動かない(config) -> None:
    hands, _, _ = build(config)
    first = hands.confirmations.issue(tool="click_at", args={}, question="1つめ？")
    second = hands.confirmations.issue(tool="click_at", args={}, question="2つめ？")
    hands.answer_confirmation(True)
    remaining = hands.confirmations.latest()
    assert remaining is not None
    assert remaining.token in (first.token, second.token)
    assert hands.confirmations.wait_for_answer(second.token, 0.1) is True
