"""全体の起動と見張り。

耳・口・頭・手はそれぞれ独立して動くので、どれかが落ちても全部は止まらない。
落ちたものだけを黙って立て直し、直せないものは声で報告する。
"""

from __future__ import annotations

import signal
import threading
import time
from pathlib import Path

from .brain.briefing import compose as compose_briefing
from .brain.claude_driver import ClaudeUnavailable
from .brain.pipeline import Pipeline
from .brain.scheduler import Scheduler
from .config import Config
from .ears.stt import Transcriber
from .log import get_logger
from .mouth.speech_text import extract_speech
from .mcp.hands import Hands
from .memory.recall import Memory
from .mouth.tts import Voice
from .safety.panic import PanicSwitch

log = get_logger("全体")

ASSETS = Path(__file__).resolve().parent.parent.parent / "claude"


class Supervisor:
    def __init__(self, config: Config) -> None:
        self._config = config
        self._voice = Voice(config.mouth)
        self._panic = PanicSwitch(config.paths.data)
        self._memory = Memory(config)
        self._hands = self._build_hands()
        self._pipeline = Pipeline(config, speak=self._voice.say, memory=self._memory)
        self._pipeline.on_stop = self._voice.stop
        if self._hands is not None:
            # 「はい」「いいえ」は耳から入って、手の待ち行列に届く。
            self._pipeline.confirm_handler = self._hands.answer_confirmation
        self._stopping = threading.Event()
        self._threads: list[threading.Thread] = []
        self._scheduler = Scheduler()
        # 聞き取りモデルは重いので、耳と外出先で1つを分け合う。ここでは器を
        # 作るだけで、モデルの読み込みは最初に使うときまで起きない。
        self._transcriber = Transcriber(config.ears.stt)

    # ---------------------------------------------------------------- 起動

    def run(self) -> int:
        self._install_signal_handlers()

        # 前回の停止が残っていたら解除する。起動したのに動かない、を防ぐ。
        if self._panic.engaged:
            log.warning("前回の緊急停止が残っていました。解除します", 理由=self._panic.reason())
            self._panic.release()

        self._spawn("口", self._serve_mouth)
        self._spawn("頭", self._prepare_brain)
        self._spawn("見張り", self._watch_late_replies)
        self._spawn("停止キー", self._watch_panic_hotkey)
        self._spawn("記憶の窓口", self._serve_memory)
        self._spawn("予定の窓口", self._serve_google)
        self._spawn("定時の仕事", self._run_scheduler)
        if self._hands is not None:
            self._spawn("手の窓口", self._serve_hands)
        if self._config.remote.enabled:
            self._spawn("外出先", self._serve_remote)
        if self._config.memory.autocommit_minutes > 0:
            self._spawn("記憶の保存", self._autocommit_memory)

        try:
            self._listen()
        except KeyboardInterrupt:
            log.info("終了します")
        finally:
            self.shutdown()
        return 0

    def _spawn(self, name: str, target) -> None:
        t = threading.Thread(target=self._guard(name, target), name=name, daemon=True)
        t.start()
        self._threads.append(t)

    def _guard(self, name: str, target):
        def wrapped() -> None:
            while not self._stopping.is_set():
                try:
                    target()
                    return
                except Exception as e:  # noqa: BLE001 - 何が落ちても全体は止めない
                    log.error(f"{name} が落ちました。立て直します", exc_info=True, error=str(e))
                    time.sleep(3)
        return wrapped

    # ---------------------------------------------------------------- 各役

    def _serve_mouth(self) -> None:
        from .mouth.server import serve

        serve(self._config, self._voice)

    def _build_hands(self) -> Hands | None:
        from .mcp.windows import create_desktop

        try:
            return Hands(
                self._config, desktop=create_desktop(),
                conn=self._memory.conn,
                ask_voice=self._voice.say,
            )
        except (RuntimeError, ImportError) as e:
            log.warning("PC の操作は使えません", error=str(e))
            return None

    def _serve_hands(self) -> None:
        from .mcp.hands_server import create_server

        create_server(self._config, self._hands).run(transport="streamable-http")

    def _serve_remote(self) -> None:
        from .remote.discord_bot import DiscordBridge

        DiscordBridge(self._config, self._pipeline, self._transcriber).run()

    def _serve_google(self) -> None:
        from .mcp.google_server import create_server

        create_server(self._config).run(transport="streamable-http")

    def _run_scheduler(self) -> None:
        """定時の仕事。毎朝の読み上げには Claude を使わない。

        毎日必ず走るものに枠を使うと、肝心なときに残っていない。
        """
        from .mcp.google_server import GoogleDesk

        desk = GoogleDesk(self._config)

        def morning() -> None:
            self._voice.say(compose_briefing(self._config, desk), truncate=False)

        if self._scheduler.daily("朝の読み上げ", self._config.google.morning_brief_at, morning):
            self._scheduler.run_forever()

    def _serve_memory(self) -> None:
        from .mcp.memory_server import create_server

        create_server(self._config, self._memory).run(transport="streamable-http")

    def _autocommit_memory(self) -> None:
        """記憶を定期的に非公開リポへ残す。

        押し出し先が公開リポだった場合は VaultGit 側で止まる。個人の予定と
        会話が公開される事故は、一度起きたら取り消せない。
        """
        interval = self._config.memory.autocommit_minutes * 60
        while not self._stopping.wait(interval):
            try:
                self._memory.sync()
            except Exception as e:  # noqa: BLE001 - 保存に失敗しても本体は動かす
                log.warning("記憶を保存できませんでした", error=str(e))

    def _prepare_brain(self) -> None:
        try:
            driver = self._pipeline._driver  # noqa: SLF001 - 同じ家の中の話
            if hasattr(driver, "provision"):
                driver.provision(ASSETS)
            self._pipeline.start()
            log.info("頭の支度ができました")
        except ClaudeUnavailable as e:
            log.error("頭を起こせません", error=str(e))
            self._voice.say("頭を起こせませんでした。設定を確かめてください。")

    def _watch_late_replies(self) -> None:
        """待ち時間を過ぎてから届いた返事を読み上げる。

        長い作業は返事が後から来る。それを黙って捨てると、
        頼んだことが終わったのかどうか分からなくなる。
        """
        while not self._stopping.is_set():
            time.sleep(2.0)
            for text in self._pipeline.collect_late_replies():
                spoken = extract_speech(text)
                if spoken:
                    log.info("遅れて届いた返事を読み上げます")
                    self._voice.say(spoken)

    def _watch_panic_hotkey(self) -> None:
        try:
            import keyboard
        except ImportError:
            log.warning(
                "停止キーを登録できません",
                対処='pip install -e ".[hands]" を実行してください',
            )
            return
        keyboard.add_hotkey(self._config.hands.panic_hotkey, self._engage_panic)
        log.info("停止キーを登録しました", key=self._config.hands.panic_hotkey)
        self._stopping.wait()

    def _engage_panic(self) -> None:
        self._panic.engage("停止キー")
        self._voice.stop()
        log.warning("緊急停止しました")

    # ---------------------------------------------------------------- 耳

    def _listen(self) -> None:
        from .ears.listener import Listener

        listener = Listener(self._config.ears, self._transcriber)
        listener.on_wake(lambda: self._voice.say("はい。", truncate=False))
        listener.warmup()

        log.info("待機に入りました。「ジャービス」と呼びかけてください")
        for heard in listener.listen_forever():
            if self._stopping.is_set():
                break
            reply = self._pipeline.handle(heard, source="voice")
            spoken = extract_speech(reply.text)
            if spoken:
                self._voice.say(spoken)

    # ---------------------------------------------------------------- 終了

    def _install_signal_handlers(self) -> None:
        def handler(_signum, _frame) -> None:
            self._stopping.set()
            raise KeyboardInterrupt

        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                signal.signal(sig, handler)
            except (ValueError, OSError):
                pass  # 主スレッド以外では登録できない

    def shutdown(self) -> None:
        self._stopping.set()
        self._scheduler.stop()
        try:
            self._memory.sync()
        except Exception as e:  # noqa: BLE001 - 終了処理で落ちない
            log.warning("最後の保存に失敗しました", error=str(e))
        self._memory.close()
        self._pipeline.close()
        self._voice.close()
        log.info("止まりました")
