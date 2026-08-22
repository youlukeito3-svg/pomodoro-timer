"""頭からの返事を受け取る箱。

tmux の画面を読み取って応答を取り出す方式は脆い。代わりに、Claude Code の
Stop フックが応答をファイルとして置き、こちらがそれを拾う。

ファイル名は時刻で、辞書順に並ぶ。指示を出す前に「今の最後尾」を覚えておき、
それより後に現れたものが自分への返事だと分かる。
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from ..log import get_logger

log = get_logger("頭")

STAMP_FORMAT = "%Y%m%dT%H%M%S%f"

# ファイルシステムが記録する mtime の分解能は time.time() より粗いことがあり
# （Windows で顕著）、書いた直後に較べると mtime のほうがわずかに未来に
# 丸まって見えることがある。「できたて」の判定がそれで狂わないよう、
# 境界にこれだけの余裕を持たせる。
_CLOCK_SLOP_SEC = 0.05


@dataclass(frozen=True)
class Reply:
    text: str
    path: Path
    meta: dict

    @property
    def stamp(self) -> str:
        return self.path.stem


class Outbox:
    def __init__(self, root: Path) -> None:
        self._root = root
        self._claimed = root / "claimed"

    def _ensure(self) -> None:
        self._root.mkdir(parents=True, exist_ok=True)
        self._claimed.mkdir(parents=True, exist_ok=True)

    def _pending(self) -> list[Path]:
        self._ensure()
        return sorted(p for p in self._root.glob("*.json") if p.is_file())

    # ------------------------------------------------------- 置く側（フック）

    def put(self, text: str, **meta: object) -> Path:
        self._ensure()
        # システムクロックの分解能は環境によって粗く（Windows で十数ミリ秒
        # 単位）、立て続けに put() すると同じスタンプになりうる。同名になると
        # 順序が失われる（mark() で覚えた印より後ろに見えなくなる）だけでなく
        # 前のファイルを上書きしてしまうので、衝突する間は1マイクロ秒ずつ
        # ずらして一意な名前を探す。
        now = datetime.now(timezone.utc)
        while True:
            stamp = now.strftime(STAMP_FORMAT)
            path = self._root / f"{stamp}.json"
            if not path.exists() and not (self._claimed / f"{stamp}.json").exists():
                break
            now += timedelta(microseconds=1)
        payload = {"text": text, "ts": now.isoformat(), **meta}
        # 書き終わる前に拾われないよう、別名で書いてから置き換える。
        tmp = path.with_suffix(".json.part")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
        return path

    # ------------------------------------------------------- 拾う側（駆動）

    def mark(self) -> str:
        """今の最後尾を覚える。ここから先に現れたものが自分への返事。"""
        pending = self._pending()
        return pending[-1].stem if pending else ""

    def wait(self, marker: str, timeout_sec: float, poll_sec: float = 0.2) -> Reply | None:
        deadline = time.monotonic() + timeout_sec
        while time.monotonic() < deadline:
            for path in self._pending():
                if path.stem > marker:
                    return self._claim(path)
            time.sleep(poll_sec)
        return None

    def drain(self, older_than_sec: float = 0.0) -> Iterator[Reply]:
        """誰も待っていなかった返事を拾う。

        長い作業を頼むと、待ち時間を超えてから返事が来る。それを捨てずに
        後から読み上げるための口。
        """
        cutoff = time.time() - older_than_sec + _CLOCK_SLOP_SEC
        for path in self._pending():
            try:
                if path.stat().st_mtime > cutoff:
                    continue
            except OSError:
                continue
            reply = self._claim(path)
            if reply is not None:
                yield reply

    def _claim(self, path: Path) -> Reply | None:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            log.warning("返事を読めませんでした", path=str(path), error=str(e))
            _discard(path)
            return None
        reply = Reply(text=payload.get("text", ""), path=path, meta=payload)
        try:
            path.replace(self._claimed / path.name)
        except OSError:
            pass
        return reply


def _discard(path: Path) -> None:
    try:
        path.unlink()
    except OSError:
        pass
