"""毎朝の読み上げ。

Google カレンダーと Gmail から組み立てるので、Claude を呼ばない。毎日必ず
走るものに枠を使わない、という方針をここでも通している。

Google に繋がっていないときは、その旨だけを短く言う。黙って何も言わないと、
壊れているのか予定が無いのか分からない。
"""

from __future__ import annotations

from datetime import datetime, timedelta

from ..config import Config
from ..log import get_logger
from .agenda import describe_day

log = get_logger("予定")


def compose(config: Config, desk, *, now: datetime | None = None) -> str:
    now = now or datetime.now()
    greeting = _greeting(now)
    parts = [f"{greeting}。{now.month}月{now.day}日です。"]

    try:
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        events = desk.events_between(day_start, day_start + timedelta(days=1))
        parts.append(describe_day(events, now=now))
    except Exception as e:  # noqa: BLE001 - 繋がらない理由は色々ある
        log.warning("予定を読めませんでした", error=str(e))
        parts.append("予定を読めませんでした。")

    try:
        unread = desk.search_mail("is:unread newer_than:1d", limit=5)
        count = 0 if "該当する" in unread else len(unread.splitlines())
        if count:
            parts.append(f"未読のメールが{count}件あります。")
    except Exception as e:  # noqa: BLE001
        log.debug("メールを読めませんでした", error=str(e))

    return "".join(parts)


def _greeting(now: datetime) -> str:
    if now.hour < 4:
        return "夜分に失礼します"
    if now.hour < 11:
        return "おはようございます"
    if now.hour < 18:
        return "こんにちは"
    return "こんばんは"
