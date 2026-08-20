"""予定の扱い。読み上げ方と、重なりの見つけ方。

Google カレンダーとのやりとりは mcp/google_server.py にあり、ここには
「それをどう言うか」「入れて大丈夫か」だけが入っている。純粋な計算なので、
通信も認証も無しでテストできる。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta


@dataclass(frozen=True)
class Event:
    summary: str
    start: datetime
    end: datetime
    all_day: bool = False
    location: str | None = None
    event_id: str | None = None

    @property
    def duration(self) -> timedelta:
        return self.end - self.start

    def overlaps(self, other_start: datetime, other_end: datetime) -> bool:
        """時間が少しでも重なっているか。終わりと始まりが同じなら重ならない。"""
        return self.start < other_end and other_start < self.end


def parse_datetime(value: str) -> datetime:
    """Google カレンダーの日時を読む。終日の予定は日付だけで来る。"""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return datetime.combine(date.fromisoformat(value), time.min)
    # 末尾の Z は Python の fromisoformat が読めない綴り。
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def event_from_api(payload: dict) -> Event:
    start_raw = payload.get("start") or {}
    end_raw = payload.get("end") or {}
    all_day = "date" in start_raw
    return Event(
        summary=payload.get("summary") or "（名称未設定）",
        start=parse_datetime(start_raw.get("dateTime") or start_raw.get("date") or ""),
        end=parse_datetime(end_raw.get("dateTime") or end_raw.get("date") or ""),
        all_day=all_day,
        location=payload.get("location"),
        event_id=payload.get("id"),
    )


# ---------------------------------------------------------------- 読み上げ


def say_time(moment: datetime) -> str:
    """声に出して自然な時刻にする。「14時0分」ではなく「14時」。"""
    return f"{moment.hour}時" if moment.minute == 0 else f"{moment.hour}時{moment.minute}分"


def describe_day(events: list[Event], *, now: datetime | None = None) -> str:
    """その日の予定を、声に出して分かる長さでまとめる。

    全部を読み上げると長い。件数を先に言い、近いものから3件だけ挙げる。
    残りは「ほかに何件」で済ませ、詳しくは画面に出す。
    """
    if not events:
        return "予定はありません。"

    now = now or datetime.now()
    ordered = sorted(events, key=lambda e: e.start)
    upcoming = [e for e in ordered if e.end > now] or ordered

    parts = [f"予定は{len(ordered)}件です。"]
    for event in upcoming[:3]:
        if event.all_day:
            parts.append(f"終日で{event.summary}。")
        else:
            parts.append(f"{say_time(event.start)}から{event.summary}。")
    remaining = len(upcoming) - 3
    if remaining > 0:
        parts.append(f"ほかに{remaining}件あります。")
    return "".join(parts)


def describe_gap(events: list[Event], *, now: datetime | None = None) -> str:
    """次の予定までどれくらいあるか。"""
    now = now or datetime.now()
    future = sorted((e for e in events if e.start > now), key=lambda e: e.start)
    if not future:
        return "この先の予定はありません。"
    minutes = int((future[0].start - now).total_seconds() // 60)
    if minutes < 60:
        return f"次の{future[0].summary}まで{minutes}分です。"
    hours, rest = divmod(minutes, 60)
    tail = f"{rest}分" if rest else ""
    return f"次の{future[0].summary}まで{hours}時間{tail}です。"


# ---------------------------------------------------------------- 重なり


def find_conflicts(events: list[Event], start: datetime, end: datetime) -> list[Event]:
    """入れようとしている時間に、もう予定が入っていないか。

    終日の予定は一日中埋まっているわけではないので、重なりとみなさない。
    """
    return [e for e in events if not e.all_day and e.overlaps(start, end)]


def needs_travel_time(
    events: list[Event], start: datetime, *, minutes: int = 30
) -> list[Event]:
    """直前の予定と場所が違うのに、間が空いていないものを探す。

    移動を考えずに予定を詰めると、当日に必ず遅れる。
    """
    tight: list[Event] = []
    for event in events:
        if event.all_day or event.end > start:
            continue
        gap = (start - event.end).total_seconds() / 60
        if 0 <= gap < minutes and event.location:
            tight.append(event)
    return tight


def describe_conflicts(conflicts: list[Event]) -> str:
    if not conflicts:
        return ""
    names = "、".join(f"{say_time(c.start)}の{c.summary}" for c in conflicts[:3])
    return f"{names}と重なります。"


def check_before_create(
    existing: list[Event], start: datetime, end: datetime, *, travel_minutes: int = 30
) -> str | None:
    """予定を入れる前の確認。問題があれば、その言い方を返す。

    予定を作ること自体は取り消せるので止めはしない。ただし黙って入れると、
    当日になって初めて気づくことになる。気づける形で伝えるのが役目。
    """
    if end <= start:
        return "終わりの時刻が始まりより前になっています。"

    conflicts = find_conflicts(existing, start, end)
    if conflicts:
        return describe_conflicts(conflicts)

    tight = needs_travel_time(existing, start, minutes=travel_minutes)
    if tight:
        previous = tight[-1]
        gap = int((start - previous.end).total_seconds() // 60)
        return (
            f"直前に{previous.location}での{previous.summary}があり、"
            f"間が{gap}分しかありません。"
        )
    return None
