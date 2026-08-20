"""ログ。画面には人が読める形で、ファイルには JSON Lines で残す。

耳・振り分け・頭・口のどの段で詰まったかを後から追えることが目的なので、
すべてのログに `stage` を付ける約束にしてある。
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

_configured = False


class _JsonLines(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "stage": getattr(record, "stage", record.name),
            "msg": record.getMessage(),
        }
        extra = getattr(record, "extra_fields", None)
        if extra:
            payload.update(extra)
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


class _Console(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        stage = getattr(record, "stage", record.name)
        when = datetime.now().strftime("%H:%M:%S")
        line = f"{when} [{stage}] {record.getMessage()}"
        extra = getattr(record, "extra_fields", None)
        if extra:
            line += "  " + " ".join(f"{k}={v}" for k, v in extra.items())
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


def setup_logging(log_dir: Path | None = None, level: int = logging.INFO) -> None:
    global _configured
    if _configured:
        return
    root = logging.getLogger("jarvis")
    root.setLevel(level)
    root.propagate = False

    console = logging.StreamHandler(sys.stderr)
    console.setFormatter(_Console())
    root.addHandler(console)

    if log_dir is not None:
        log_dir.mkdir(parents=True, exist_ok=True)
        fh = logging.FileHandler(log_dir / "jarvis.log", encoding="utf-8")
        fh.setFormatter(_JsonLines())
        root.addHandler(fh)

    _configured = True


class StageLogger:
    """`log.info("聞き取り完了", text=...)` と書けるようにする薄い包み。"""

    def __init__(self, stage: str) -> None:
        self._stage = stage
        self._logger = logging.getLogger(f"jarvis.{stage}")

    def _emit(self, level: int, msg: str, exc_info: bool = False, **fields: object) -> None:
        self._logger.log(
            level, msg, exc_info=exc_info,
            extra={"stage": self._stage, "extra_fields": fields or None},
        )

    def debug(self, msg: str, **f: object) -> None:
        self._emit(logging.DEBUG, msg, **f)

    def info(self, msg: str, **f: object) -> None:
        self._emit(logging.INFO, msg, **f)

    def warning(self, msg: str, **f: object) -> None:
        self._emit(logging.WARNING, msg, **f)

    def error(self, msg: str, exc_info: bool = False, **f: object) -> None:
        self._emit(logging.ERROR, msg, exc_info=exc_info, **f)


def get_logger(stage: str) -> StageLogger:
    return StageLogger(stage)
