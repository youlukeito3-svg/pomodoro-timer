"""操作してよいかの判定。

方針は「許可アプリだけ＋危険操作は確認」。判定は純粋な関数として切り出してあり、
Windows が無くてもテストできる。実際にマウスを動かす側（hands MCP）は、
必ずこの判定を通してからでないと動かない。

判定の順序には意味がある。deny は allow より強く、確認は最後に効く。
"""

from __future__ import annotations

import re
import secrets
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import yaml

Verdict = Literal["allow", "deny", "confirm"]


@dataclass(frozen=True)
class Context:
    """操作しようとしている相手。"""

    app: str | None = None      # 実行ファイル名（chrome.exe など）
    title: str | None = None    # ウィンドウタイトル


@dataclass(frozen=True)
class Decision:
    verdict: Verdict
    reason: str
    question: str | None = None   # confirm のときに読み上げる問いかけ

    @property
    def ok(self) -> bool:
        return self.verdict == "allow"


@dataclass
class Policy:
    allow: set[str] = field(default_factory=set)
    deny: set[str] = field(default_factory=set)
    ui_text: list[str] = field(default_factory=list)
    typing: list[re.Pattern[str]] = field(default_factory=list)
    shell: list[re.Pattern[str]] = field(default_factory=list)
    title_deny: list[str] = field(default_factory=list)

    @classmethod
    def load(cls, path: Path) -> "Policy":
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        confirm = raw.get("confirm_required") or {}
        return cls(
            allow={a.lower() for a in raw.get("allow") or []},
            deny={d.lower() for d in raw.get("deny") or []},
            ui_text=[t.lower() for t in confirm.get("ui_text") or []],
            typing=[re.compile(p) for p in confirm.get("typing") or []],
            shell=[re.compile(p) for p in confirm.get("shell") or []],
            title_deny=[t.lower() for t in raw.get("title_deny") or []],
        )

    # ------------------------------------------------------------ 判定

    def check(
        self, *, tool: str, context: Context = Context(),
        ui_text: str | None = None, typing: str | None = None, shell: str | None = None,
    ) -> Decision:
        """1回の操作を判定する。"""
        # シェルは前面ウィンドウと無関係に走るので、アプリ判定より先に見る。
        if shell is not None:
            for pat in self.shell:
                if pat.search(shell):
                    return Decision(
                        "confirm",
                        f"危険なコマンドに当たりました（{pat.pattern}）",
                        question=f"{_shorten(shell)} を実行しますか？",
                    )

        app = (context.app or "").lower()
        title = (context.title or "").lower()

        if app and app in self.deny:
            return Decision("deny", f"{context.app} は触らない約束です")

        for word in self.title_deny:
            if word and word in title:
                return Decision("deny", f"この画面（{word}）では操作しません")

        # アプリを相手にする操作なのに、相手が分からない・許可されていない場合は動かない。
        if _needs_app(tool):
            if not app:
                return Decision("deny", "前面のアプリが分からないので操作しません")
            if app not in self.allow:
                return Decision("deny", f"{context.app} は操作を許可されていません")

        if ui_text:
            lowered = ui_text.lower()
            for word in self.ui_text:
                if word and word in lowered:
                    return Decision(
                        "confirm",
                        f"取り返しがつかない操作かもしれません（{word}）",
                        question=f"「{_shorten(ui_text)}」を押しますか？",
                    )

        if typing is not None:
            for pat in self.typing:
                if pat.search(typing):
                    return Decision(
                        "confirm",
                        "入力しようとしている内容が要注意です",
                        question="この内容を入力しますか？",
                    )

        return Decision("allow", "許可されています")


# ツールごとに「前面アプリの許可が要るか」を決める。
# 画面を見るだけの操作にアプリの許可は要らない。
_READ_ONLY_TOOLS = {"screenshot", "list_windows", "get_active_window", "get_clipboard"}


def _needs_app(tool: str) -> bool:
    return tool not in _READ_ONLY_TOOLS and not tool.startswith("shell")


def _shorten(text: str, limit: int = 60) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 1] + "…"


# ---------------------------------------------------------------- 確認の保留

@dataclass
class Pending:
    token: str
    question: str
    tool: str
    args: dict
    expires_at: float
    # 発行順。time.monotonic() の分解能は環境によって粗く（Windows で
    # 十数ミリ秒単位）、立て続けに issue() すると expires_at が同値に
    # なることがある。その同点を発行順で崩すためだけに使う。
    seq: int = 0
    # 返事が届いたことを、待っている側へ知らせるための合図。
    answered: threading.Event = field(default_factory=threading.Event)
    agreed: bool | None = None


class ConfirmStore:
    """確認待ちの操作を預かる。

    口が問いかけを読み上げ、耳が「はい」を拾ったときに `confirm()` が呼ばれる。
    期限切れのものは黙って捨てる。返事をしないまま放置した操作が
    あとから急に動きだす、ということが起きないようにするため。
    """

    def __init__(self, ttl_sec: int = 60) -> None:
        self._ttl = ttl_sec
        self._pending: dict[str, Pending] = {}
        self._next_seq = 0

    def issue(self, *, tool: str, args: dict, question: str, now: float | None = None) -> Pending:
        now = time.monotonic() if now is None else now
        self._sweep(now)
        self._next_seq += 1
        p = Pending(
            token=secrets.token_urlsafe(8), question=question,
            tool=tool, args=args, expires_at=now + self._ttl, seq=self._next_seq,
        )
        self._pending[p.token] = p
        return p

    def confirm(self, token: str, now: float | None = None) -> Pending | None:
        """承諾された操作を取り出す。取り出した操作は待ち行列から消える。"""
        now = time.monotonic() if now is None else now
        self._sweep(now)
        pending = self._pending.pop(token, None)
        if pending is not None:
            pending.agreed = True
            pending.answered.set()
        return pending

    def answer(self, token: str, agreed: bool, now: float | None = None) -> Pending | None:
        """はい／いいえを届ける。待っている側の `wait_for_answer` が返る。

        ここでは待ち行列から取り除かない。取り除くのは待っている側で、
        そうしないと、返事が先に届いたときに待ち手が取り逃がす。
        """
        now = time.monotonic() if now is None else now
        self._sweep(now)
        pending = self._pending.get(token)
        if pending is None:
            return None
        pending.agreed = agreed
        pending.answered.set()
        return pending

    def wait_for_answer(self, token: str, timeout: float) -> bool | None:
        """返事が届くまで待つ。届かなければ None（＝実行しない）。

        待つのは道具を呼んだ側で、返事を届けるのは耳の側。別のスレッドに
        なるので、合図はイベントで渡す。返事が先に届いていた場合も、
        イベントは立ったままなので取り逃がさない。
        """
        pending = self._pending.get(token)
        if pending is None:
            return None
        answered = pending.answered.wait(timeout)
        self._pending.pop(token, None)
        return pending.agreed if answered else None

    def latest(self, now: float | None = None) -> Pending | None:
        """token を言わずに「はい」と答えられるように、直近の1件を返す。

        既に返事が届いたものは対象にしない。同じ「はい」で2つの操作が
        動いてしまうのを防ぐため。
        """
        now = time.monotonic() if now is None else now
        self._sweep(now)
        waiting = [p for p in self._pending.values() if not p.answered.is_set()]
        if not waiting:
            return None
        return max(waiting, key=lambda p: (p.expires_at, p.seq))

    def cancel_all(self) -> int:
        n = len(self._pending)
        self._pending.clear()
        return n

    def _sweep(self, now: float) -> None:
        for token, p in list(self._pending.items()):
            if p.expires_at <= now:
                del self._pending[token]

    def __len__(self) -> int:
        return len(self._pending)
