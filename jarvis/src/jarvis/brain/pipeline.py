"""一往復の流れ。聞いた言葉を受け取り、返す言葉を決める。

耳・口・Discord のどこから入っても、通る道はここ一本にしてある。
外出先からの指示と、目の前での指示とで挙動が変わると、覚えることが増える。
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable

from ..config import Config
from ..log import get_logger
from ..memory import db
from .budget import Budget
from .claude_driver import ClaudeDriver, ClaudeUnavailable, create_driver
from .local_skills import SkillResult
from .router import Router

if TYPE_CHECKING:
    from ..memory.recall import Memory

log = get_logger("頭")

Speak = Callable[[str], None]


@dataclass(frozen=True)
class Reply:
    text: str
    route: str
    used_claude: bool = False


class Pipeline:
    def __init__(
        self, config: Config, *, speak: Speak | None = None,
        driver: ClaudeDriver | None = None, conn: db.Connection | None = None,
        memory: "Memory | None" = None,
    ) -> None:
        self._config = config
        self._memory = memory
        self._speak: Speak = speak or (lambda text: print(f"[ジャービス] {text}"))
        self._conn = conn or db.connect(config.paths.db, embed_dim=config.memory.embed_dim)
        self._router = Router(config.brain.router)
        self._driver = driver or create_driver(config)
        self._budget = Budget(self._conn, config.brain.budget)
        self._timers: list[threading.Timer] = []
        # 確認待ちの操作に返事をするための繋ぎ。手（段3）が入ると差し込まれる。
        self.confirm_handler: Callable[[bool], str | None] | None = None
        self.on_stop: Callable[[], None] | None = None

    # ---------------------------------------------------------------- 本体

    def handle(self, heard: str, *, source: str = "voice") -> Reply:
        heard = heard.strip()
        if not heard:
            return Reply("", route="empty")

        started = time.monotonic()
        route = self._router.route(heard)
        log.info("振り分けました", 行き先=route.destination, 理由=route.reason)

        if route.destination == "skill" and route.skill is not None:
            reply = self._run_skill(route.skill.run(route.args or {}))
        elif route.destination == "chitchat":
            reply = Reply(route.reply or "", route="chitchat")
        else:
            reply = self._ask_claude(heard, source=source)

        db.record_conversation(
            self._conn, source=source, heard=heard, reply=reply.text,
            route=reply.route, latency_ms=int((time.monotonic() - started) * 1000),
        )
        return reply

    # ------------------------------------------------------------ 各行き先

    def _run_skill(self, result: SkillResult) -> Reply:
        if result.command == "stop":
            if self.on_stop:
                self.on_stop()
            return Reply("", route="local")

        if result.command and result.command.startswith("timer:"):
            self._start_timer(int(result.command.split(":", 1)[1]))

        if result.confirm is not None:
            answer = self._answer_confirmation(result.confirm)
            if answer is not None:
                return Reply(answer, route="local")
            # 確認待ちが無いのに「はい」と言われた。聞き流すより頭に渡す。
            if result.confirm:
                return Reply("何に対する返事でしょうか。", route="local")

        return Reply(result.text, route="local")

    def _ask_claude(self, heard: str, *, source: str) -> Reply:
        if not self._budget.allows():
            status = self._budget.status()
            log.warning("上限に達しました", 使用状況=status.describe())
            return Reply(self._budget.refusal_message, route="refused")

        prompt = self.build_prompt(heard)
        self._budget.record(
            driver=self._driver.name, prompt_chars=len(prompt), source=source
        )
        try:
            answer = self._driver.ask(prompt)
        except ClaudeUnavailable as e:
            log.error("頭に届きませんでした", error=str(e))
            return Reply("頭に繋がりませんでした。少し待ってからもう一度お願いします。", route="error")
        return Reply(answer.text, route="claude", used_claude=True)

    def build_prompt(self, heard: str) -> str:
        """頭に渡す文を組み立てる。

        思い出した記憶を先に付けておく。頭は MCP の `recall` でも記憶を
        引けるが、毎回そこから始めさせると往復が1つ増える。よく使う分だけ
        こちらで先に渡し、深く掘りたいときだけ頭に引かせる。

        長くなりすぎないよう、ここで渡すのは短くまとめたものに限る。
        指示が膨らむと、その分だけサブスク枠を余計に食う。
        """
        if self._memory is None:
            return heard
        try:
            context = self._memory.recall(heard).as_prompt()
        except Exception as e:  # noqa: BLE001 - 思い出せなくても用事は進める
            log.warning("思い出せませんでした", error=str(e))
            return heard
        return f"{context}\n\n{heard}" if context else heard

    # ------------------------------------------------------------ 補助

    def _answer_confirmation(self, agreed: bool) -> str | None:
        if self.confirm_handler is None:
            return None
        return self.confirm_handler(agreed)

    def _start_timer(self, seconds: int) -> None:
        def ring() -> None:
            self._speak("お時間です。")

        timer = threading.Timer(seconds, ring)
        timer.daemon = True
        timer.start()
        self._timers.append(timer)
        # 鳴り終わったタイマーを溜めない。
        self._timers = [t for t in self._timers if t.is_alive()]

    def collect_late_replies(self) -> list[str]:
        """待ち時間を過ぎてから届いた返事を拾う。

        長い作業を頼むと返事は後から来る。それを捨てずに読み上げるための口。
        """
        pending = getattr(self._driver, "pending_replies", None)
        if pending is None:
            return []
        return [r.text for r in pending(older_than_sec=1.0) if r.text]

    def start(self) -> None:
        self._driver.start()

    def close(self) -> None:
        for timer in self._timers:
            timer.cancel()
        self._router.close()
