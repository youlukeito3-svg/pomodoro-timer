"""決まった時刻に動くもの。今のところ、毎朝の読み上げ。

毎日必ず走るものに Claude を使わない。朝の読み上げは Google カレンダーから
組み立てられるので、頭を起こす必要がない。毎日1本ずつ枠を削るのは惜しい。

いつ動くかの計算だけを純粋な関数にしてあるので、日をまたぐ挙動もテストできる。
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Callable

from ..log import get_logger

log = get_logger("予定")


def parse_hhmm(value: str) -> time | None:
    """"07:00" を時刻にする。空文字や壊れた綴りなら None（＝動かさない）。"""
    if not value or ":" not in value:
        return None
    hour, _, minute = value.partition(":")
    try:
        return time(int(hour), int(minute))
    except ValueError:
        return None


def next_run_at(now: datetime, at: time) -> datetime:
    """次にその時刻が来るのはいつか。今日ぶんを過ぎていれば明日。"""
    today = datetime.combine(now.date(), at)
    return today if today > now else today + timedelta(days=1)


@dataclass
class DailyJob:
    name: str
    at: time
    run: Callable[[], None]


class Scheduler:
    """決まった時刻に仕事を1つずつ起こす。

    秒単位の正確さは要らないので、次の時刻まで素直に眠る。止めるときは
    イベントで起こすので、終了を待たされることはない。
    """

    def __init__(self) -> None:
        self._jobs: list[DailyJob] = []
        self._stopping = threading.Event()

    def daily(self, name: str, at: time | str | None, run: Callable[[], None]) -> bool:
        moment = parse_hhmm(at) if isinstance(at, str) else at
        if moment is None:
            log.info("時刻が決まっていないので登録しません", 仕事=name)
            return False
        self._jobs.append(DailyJob(name, moment, run))
        return True

    def run_forever(self, now_fn: Callable[[], datetime] = datetime.now) -> None:
        if not self._jobs:
            return
        while not self._stopping.is_set():
            now = now_fn()
            job, when = min(
                ((j, next_run_at(now, j.at)) for j in self._jobs), key=lambda pair: pair[1]
            )
            wait_sec = max(1.0, (when - now).total_seconds())
            log.info("次の仕事を待ちます", 仕事=job.name, 時刻=when.strftime("%m/%d %H:%M"))
            if self._stopping.wait(wait_sec):
                return
            try:
                job.run()
            except Exception as e:  # noqa: BLE001 - 1つ転んでも次の朝は来る
                log.error("定時の仕事に失敗しました", exc_info=True, 仕事=job.name, error=str(e))

    def stop(self) -> None:
        self._stopping.set()
