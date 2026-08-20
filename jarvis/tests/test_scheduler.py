"""定時の仕事。日をまたぐところが間違いやすい。"""

from datetime import datetime, time

import pytest

from jarvis.brain.scheduler import Scheduler, next_run_at, parse_hhmm


@pytest.mark.parametrize(
    ("given", "expected"),
    [("07:00", time(7, 0)), ("23:59", time(23, 59)), ("7:5", time(7, 5))],
)
def test_時刻を読める(given: str, expected: time) -> None:
    assert parse_hhmm(given) == expected


@pytest.mark.parametrize("given", ["", "あさ", "25:00", "07", "07:99"])
def test_読めない綴りは動かさない(given: str) -> None:
    """壊れた設定で毎分起こされるより、動かないほうがよい。"""
    assert parse_hhmm(given) is None


def test_今日ぶんがまだなら今日() -> None:
    now = datetime(2026, 8, 20, 6, 0)
    assert next_run_at(now, time(7, 0)) == datetime(2026, 8, 20, 7, 0)


def test_今日ぶんを過ぎていたら明日() -> None:
    now = datetime(2026, 8, 20, 8, 0)
    assert next_run_at(now, time(7, 0)) == datetime(2026, 8, 21, 7, 0)


def test_ちょうどその時刻なら次は明日() -> None:
    """同じ仕事を1日に二度走らせない。"""
    now = datetime(2026, 8, 20, 7, 0)
    assert next_run_at(now, time(7, 0)) == datetime(2026, 8, 21, 7, 0)


def test_時刻が決まっていなければ登録しない() -> None:
    scheduler = Scheduler()
    assert not scheduler.daily("朝の読み上げ", "", lambda: None)


def test_仕事が無ければ何もせず終わる() -> None:
    Scheduler().run_forever()


def test_止めれば待たずに戻る() -> None:
    scheduler = Scheduler()
    scheduler.daily("朝の読み上げ", "07:00", lambda: None)
    scheduler.stop()
    scheduler.run_forever()
