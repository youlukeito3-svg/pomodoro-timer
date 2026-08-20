"""頭の駆動。Claude Code に指示を渡して、返事を受け取る。

方式を2つ持っているのは、課金の方針が動くからだ。Anthropic は 2026年5月に
`claude -p` と Agent SDK をサブスク枠から外す計画を出し、6月15日に撤回した。
撤回はしたが「作り直して再導入する」とも言っている。

対話セッションはこの話の対象外で、これからもサブスク枠に留まる。だから
既定は tmux に常駐させた対話セッションに流し込む方式にしてある。方針が
また変わったら、設定の driver を書き換えるだけで乗り換えられる。
"""

from __future__ import annotations

import abc
import json
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path

from ..config import BrainConfig, Config
from ..log import get_logger
from .outbox import Outbox, Reply

log = get_logger("頭")


class ClaudeUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class Answer:
    text: str
    timed_out: bool = False


class ClaudeDriver(abc.ABC):
    """指示を1本渡して、返事を1本もらう。"""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._brain: BrainConfig = config.brain
        # 頭はひとつしかない。二人分の指示を同時に流し込まない。
        self._lock = threading.Lock()

    @abc.abstractmethod
    def ask(self, prompt: str) -> Answer: ...

    def start(self) -> None:
        """常駐が要る方式のための準備。要らなければ何もしない。"""

    def stop(self) -> None:
        """後片付け。"""

    @property
    def name(self) -> str:
        return self._brain.driver

    # ---------------------------------------------------------- 共通の道具

    def _run(self, args: list[str], *, input_text: str | None = None, timeout: float = 30.0):
        cmd = list(self._brain.wsl_prefix) + args
        try:
            return subprocess.run(
                cmd, input=input_text, capture_output=True, text=True,
                timeout=timeout, encoding="utf-8", errors="replace",
            )
        except FileNotFoundError as e:
            raise ClaudeUnavailable(f"{cmd[0]} を実行できません: {e}") from e
        except subprocess.TimeoutExpired as e:
            raise ClaudeUnavailable(f"{' '.join(args[:2])} が応答しません") from e


class TmuxDriver(ClaudeDriver):
    """tmux に常駐させた対話セッションへ流し込む（既定）。

    入力は tmux のバッファ経由。`send-keys` に日本語をそのまま渡すと
    エスケープで壊れるが、標準入力からバッファに載せれば壊れない。

    出力は画面を読まない。Claude Code の Stop フックが返事をファイルに置き、
    それを Outbox 経由で拾う。画面のパースは表示が変わるたびに壊れるが、
    フックの契約は変わらない。
    """

    BUFFER = "jarvis-in"
    # これを超える長さ、または改行を含む指示はファイルに書いて参照させる。
    # 対話画面に長文を貼ると、途中で送信されてしまうことがあるため。
    INLINE_LIMIT = 800

    def __init__(self, config: Config) -> None:
        super().__init__(config)
        self._outbox = Outbox(config.paths.data / "outbox")
        self._session = self._brain.tmux_session
        # 作業ディレクトリは WSL 側のパス。Windows 側で展開してはいけないので
        # 生の文字列のまま持ち、`~` は向こうのシェルに展開させる。
        self._workspace_raw = config.paths.workspace
        self._workspace_resolved: str | None = None

    @property
    def _remote_workspace(self) -> str:
        """WSL 側の作業ディレクトリの絶対パス。`~` は向こうのシェルに展開させる。"""
        if self._workspace_resolved is None:
            result = self._run(["sh", "-c", f'mkdir -p {self._workspace_raw} && cd {self._workspace_raw} && pwd'])
            resolved = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ""
            if result.returncode != 0 or not resolved.startswith("/"):
                raise ClaudeUnavailable(
                    f"作業ディレクトリを用意できません: {self._workspace_raw} "
                    f"({result.stderr.strip()})"
                )
            self._workspace_resolved = resolved
        return self._workspace_resolved

    # ------------------------------------------------------------ 常駐

    def start(self) -> None:
        if self._session_alive():
            log.info("既にセッションが立っています", session=self._session)
            return
        log.info("セッションを立てます", session=self._session)
        result = self._run(
            [
                "tmux", "new-session", "-d", "-s", self._session,
                "-c", self._remote_workspace, self._brain.claude_bin,
            ],
            timeout=60,
        )
        if result.returncode != 0:
            raise ClaudeUnavailable(f"セッションを立てられません: {result.stderr.strip()}")

    def stop(self) -> None:
        if self._session_alive():
            self._run(["tmux", "kill-session", "-t", self._session])

    def _session_alive(self) -> bool:
        try:
            return self._run(["tmux", "has-session", "-t", self._session]).returncode == 0
        except ClaudeUnavailable:
            return False

    # ------------------------------------------------------------ 支度

    def provision(self, assets_dir: Path) -> None:
        """WSL 側の作業ディレクトリに、頭が要るものを置く。

        人格と出力の約束（CLAUDE.md）、フックの登録（settings.json）、
        フック本体（stop_speak.py）の3つ。毎回上書きするので、
        こちら側で直せば向こうにも反映される。
        """
        workspace = self._remote_workspace
        reply_url = (
            f"http://{self._config.mouth.listen_host}:{self._config.mouth.listen_port}/reply"
        )

        settings = json.loads((assets_dir / "settings.json").read_text(encoding="utf-8"))
        settings.setdefault("env", {})["JARVIS_REPLY_URL"] = reply_url

        self._write_remote(
            f"{workspace}/CLAUDE.md", (assets_dir / "CLAUDE.md").read_text(encoding="utf-8")
        )
        self._write_remote(
            f"{workspace}/.claude/settings.json",
            json.dumps(settings, ensure_ascii=False, indent=2) + "\n",
        )
        self._write_remote(
            f"{workspace}/.jarvis/stop_speak.py",
            (assets_dir.parent / "hooks" / "stop_speak.py").read_text(encoding="utf-8"),
        )
        log.info("作業ディレクトリを整えました", workspace=workspace, reply_url=reply_url)

    # ------------------------------------------------------------ 送受

    def ask(self, prompt: str) -> Answer:
        with self._lock:
            if not self._session_alive():
                self.start()
            marker = self._outbox.mark()
            self._send(self._to_single_line(prompt))
            reply = self._outbox.wait(marker, timeout_sec=self._brain.response_timeout_sec)
            if reply is None:
                log.warning("返事が来ませんでした", timeout=self._brain.response_timeout_sec)
                return Answer(
                    "まだ考えています。終わったらこちらから声をかけます。", timed_out=True
                )
            return Answer(reply.text)

    def pending_replies(self, older_than_sec: float = 1.0) -> list[Reply]:
        """待ち時間を過ぎてから届いた返事を拾う。"""
        return list(self._outbox.drain(older_than_sec=older_than_sec))

    def _send(self, line: str) -> None:
        loaded = self._run(
            ["tmux", "load-buffer", "-b", self.BUFFER, "-"], input_text=line
        )
        if loaded.returncode != 0:
            raise ClaudeUnavailable(f"指示を載せられません: {loaded.stderr.strip()}")
        self._run(["tmux", "paste-buffer", "-d", "-b", self.BUFFER, "-t", self._session])
        self._run(["tmux", "send-keys", "-t", self._session, "Enter"])
        log.info("頭に渡しました", chars=len(line))

    def _to_single_line(self, prompt: str) -> str:
        """対話画面に安全に貼れる 1 行にする。

        長い指示や改行を含む指示は、そのまま貼ると途中で送信されてしまう。
        ファイルに書いてパスだけを渡せば、その心配がない。
        """
        flat = " ".join(prompt.split())
        if len(flat) <= self.INLINE_LIMIT and "\n" not in prompt:
            return flat
        remote_path = f"{self._remote_workspace}/.jarvis/request.md"
        self._write_remote(remote_path, prompt)
        return f"@{remote_path} を読んで、そこに書かれた指示を実行してください。"

    def _write_remote(self, path: str, content: str) -> None:
        """WSL 側にファイルを書く。パスの対応関係を知らなくて済むよう標準入力で渡す。"""
        directory = path.rsplit("/", 1)[0]
        result = self._run(
            ["sh", "-c", f'mkdir -p "{directory}" && cat > "{path}"'],
            input_text=content, timeout=30,
        )
        if result.returncode != 0:
            raise ClaudeUnavailable(f"指示を書き出せません: {result.stderr.strip()}")


class HeadlessDriver(ClaudeDriver):
    """`claude -p` を都度起動する。

    速くて扱いやすいが、Anthropic がこの経路を別枠課金に移す可能性がある。
    課金を避けたいなら tmux 方式のままにしておくこと。
    """

    def ask(self, prompt: str) -> Answer:
        with self._lock:
            result = self._run(
                [self._brain.claude_bin, "-p", prompt, "--output-format", "text"],
                timeout=self._brain.response_timeout_sec,
            )
        if result.returncode != 0:
            raise ClaudeUnavailable(result.stderr.strip() or "claude -p が失敗しました")
        return Answer(result.stdout.strip())


def create_driver(config: Config) -> ClaudeDriver:
    drivers = {"tmux": TmuxDriver, "headless": HeadlessDriver}
    try:
        return drivers[config.brain.driver](config)
    except KeyError:
        raise ClaudeUnavailable(
            f"driver は {' か '.join(drivers)} のどちらかにしてください: {config.brain.driver}"
        ) from None
