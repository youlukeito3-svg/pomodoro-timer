"""緊急停止。

耳・口・手はそれぞれ別のプロセスなので、停止の合図はファイル1つで共有する。
プロセス内の変数では、止めたいときに限って届かない相手が出る。
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

FLAG_NAME = "panic.flag"


class PanicSwitch:
    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / FLAG_NAME

    @property
    def path(self) -> Path:
        return self._path

    def engage(self, reason: str = "手動") -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self._path.write_text(f"{stamp}\t{reason}\n", encoding="utf-8")

    def release(self) -> None:
        try:
            os.remove(self._path)
        except FileNotFoundError:
            pass

    @property
    def engaged(self) -> bool:
        return self._path.exists()

    def reason(self) -> str | None:
        if not self.engaged:
            return None
        try:
            _, _, reason = self._path.read_text(encoding="utf-8").strip().partition("\t")
            return reason or "手動"
        except OSError:
            return "手動"
