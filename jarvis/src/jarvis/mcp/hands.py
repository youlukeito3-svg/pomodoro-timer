"""手。PC を操作する中身。

MCP の口（hands_server.py）とは分けてある。ここには判定・確認・記録の段取り
だけが入っていて、実際に触るのは Desktop に任せる。おかげで Windows が
無くても、安全装置がちゃんと効くことをテストできる。

1回の操作は必ずこの順で通る。

    緊急停止の確認 → 許可の判定 → （要れば）声で確認 → 実行 → 記録

途中で止まった操作も、止まった理由と一緒に記録に残る。何をして何を断ったかが
後から追えることが、この仕組みの信頼の源になる。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from ..config import Config
from ..log import get_logger
from ..memory import db
from ..safety.guard import ConfirmStore, Context, Policy
from ..safety.panic import PanicSwitch
from .windows import Desktop, WindowInfo, screenshot_path

log = get_logger("手")

# 声で尋ねる役。届かなければ確認は取れず、操作は実行されない。
AskVoice = Callable[[str], None]


@dataclass(frozen=True)
class Outcome:
    text: str
    performed: bool

    def __str__(self) -> str:
        return self.text


class Hands:
    def __init__(
        self, config: Config, *, desktop: Desktop, policy: Policy | None = None,
        store: ConfirmStore | None = None, panic: PanicSwitch | None = None,
        conn: db.Connection | None = None, ask_voice: AskVoice | None = None,
    ) -> None:
        self._config = config
        self._desktop = desktop
        self._policy = policy or Policy.load(config.allowlist_path)
        self.confirmations = store or ConfirmStore(config.hands.confirm_ttl_sec)
        self._panic = panic or PanicSwitch(config.paths.data)
        self._conn = conn or db.connect(config.paths.db, embed_dim=config.memory.embed_dim)
        # 声で尋ねる役。あとから差し込めるように公開しておく。
        # 供給されるまでは、確認が要る操作は実行されない。
        self.ask_voice = ask_voice

    # ---------------------------------------------------------------- 見る

    def screenshot(self) -> str:
        path = screenshot_path(self._config.paths.screenshots, "view")
        self._desktop.screenshot(path)
        width, height = self._desktop.screen_size()
        db.record_action(self._conn, tool="screenshot", decision="allowed", screenshot=str(path))
        return f"画面を {path} に保存しました（{width}×{height}）。"

    def active_window(self) -> str:
        info = self._desktop.active_window()
        if info.app is None:
            return "前面のアプリが分かりません。"
        return f"{info.app}「{info.title or ''}」"

    def list_windows(self) -> str:
        windows = self._desktop.list_windows()
        if not windows:
            return "開いているウィンドウがありません。"
        return "\n".join(f"- {w.app or '不明'}: {w.title}" for w in windows[:30])

    # ---------------------------------------------------------------- 触る

    def focus_window(self, title_contains: str) -> str:
        return str(
            self._guarded(
                "focus_window", {"title_contains": title_contains},
                execute=lambda: (
                    f"{title_contains} を前面に出しました。"
                    if self._desktop.focus(title_contains)
                    else f"{title_contains} を含むウィンドウが見つかりません。"
                ),
                context=WindowInfo(app=None, title=title_contains),
                skip_app_check=True,
            )
        )

    def click_at(self, x: int, y: int, button: str = "left", double: bool = False) -> str:
        # 座標だけで押すと、そこに何があるか分からないまま押すことになる。
        # 部品の名前が読めれば、「送信」を踏む前に気づける。
        label = self._desktop.control_name_at(x, y)

        def run() -> str:
            self._desktop.click(x, y, button=button, double=double)
            where = f"（{label}）" if label else ""
            return f"({x}, {y}) を押しました{where}。"

        return str(self._guarded("click_at", {"x": x, "y": y, "label": label},
                                 ui_text=label, execute=run))

    def click_control(self, name: str) -> str:
        def run() -> str:
            _ok, message = self._desktop.click_control(name)
            return message

        return str(self._guarded("click_control", {"name": name}, ui_text=name, execute=run))

    def type_text(self, text: str) -> str:
        def run() -> str:
            self._desktop.type_text(text)
            return f"{len(text)} 文字入力しました。"

        return str(self._guarded("type_text", {"text": text}, typing=text, execute=run))

    def press_keys(self, keys: list[str]) -> str:
        def run() -> str:
            self._desktop.hotkey(keys)
            return f"{'+'.join(keys)} を押しました。"

        return str(self._guarded("press_keys", {"keys": keys},
                                 ui_text="+".join(keys), execute=run))

    def scroll(self, amount: int) -> str:
        def run() -> str:
            self._desktop.scroll(amount)
            return f"{amount} だけ画面を送りました。"

        return str(self._guarded("scroll", {"amount": amount}, execute=run))

    # ---------------------------------------------------------------- 段取り

    def _guarded(
        self, tool: str, args: dict, *, execute: Callable[[], str],
        ui_text: str | None = None, typing: str | None = None,
        context: WindowInfo | None = None, skip_app_check: bool = False,
    ) -> Outcome:
        if self._panic.engaged:
            reason = self._panic.reason() or "停止中"
            self._record(tool, args, "denied", None, f"緊急停止中（{reason}）")
            return Outcome(
                f"緊急停止がかかっているので操作しません。"
                f"解除するには jarvis resume を実行してください。", performed=False
            )

        window = context or self._desktop.active_window()
        decision = self._policy.check(
            tool="screenshot" if skip_app_check else tool,
            context=Context(app=window.app, title=window.title),
            ui_text=ui_text, typing=typing,
        )

        if decision.verdict == "deny":
            self._record(tool, args, "denied", window, decision.reason)
            log.info("断りました", tool=tool, 理由=decision.reason)
            return Outcome(f"できません。{decision.reason}。", performed=False)

        if decision.verdict == "confirm":
            agreed = self._ask_and_wait(tool, args, decision.question or "実行しますか？")
            if not agreed:
                self._record(tool, args, "denied", window, "確認が取れませんでした")
                return Outcome(
                    "確認が取れなかったので実行しませんでした。"
                    "必要なら、もう一度はっきり指示してください。", performed=False
                )
            self._record(tool, args, "confirmed", window, decision.reason)
        else:
            self._record(tool, args, "allowed", window, None)

        result = execute()
        log.info("操作しました", tool=tool, 相手=window.app)
        return Outcome(result, performed=True)

    def _ask_and_wait(self, tool: str, args: dict, question: str) -> bool:
        if self.ask_voice is None:
            # 尋ねる口が無い。黙って実行するより、実行しないほうが安全。
            log.warning("確認を取れる相手がいません", tool=tool)
            return False
        pending = self.confirmations.issue(tool=tool, args=args, question=question)
        log.info("確認を求めます", tool=tool, question=question)
        self.ask_voice(question)
        agreed = self.confirmations.wait_for_answer(
            pending.token, self._config.hands.confirm_ttl_sec
        )
        return bool(agreed)

    def _record(
        self, tool: str, args: dict, decision: str,
        window: WindowInfo | None, reason: str | None,
    ) -> None:
        screenshot = None
        if self._config.hands.screenshot_on_action and decision in ("allowed", "confirmed"):
            try:
                path = screenshot_path(self._config.paths.screenshots, tool)
                self._desktop.screenshot(path)
                screenshot = str(path)
            except Exception as e:  # noqa: BLE001 - 記録が取れなくても操作は続ける
                log.debug("記録用の画面を撮れませんでした", error=str(e))
        db.record_action(
            self._conn, tool=tool, decision=decision,
            target_app=window.app if window else None,
            window_title=window.title if window else None,
            payload=args, reason=reason, screenshot=screenshot,
        )

    # ---------------------------------------------------------------- 返事

    def answer_confirmation(self, agreed: bool) -> str | None:
        """声の「はい／いいえ」を、待っている操作へ届ける。

        pipeline がこれを confirm_handler として持つ。確認待ちが無ければ
        None を返し、pipeline はそれを見て聞き返す。
        """
        pending = self.confirmations.latest()
        if pending is None:
            return None
        self.confirmations.answer(pending.token, agreed)
        return "分かりました。進めます。" if agreed else "やめておきます。"
