"""予定の読み上げ方と、入れる前の確認。"""

from datetime import datetime, timedelta

import pytest

from jarvis.brain.agenda import (
    Event, check_before_create, describe_conflicts, describe_day, describe_gap,
    event_from_api, find_conflicts, needs_travel_time, parse_datetime, say_time,
)


def at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 8, 20, hour, minute)


def event(name: str, start: int, end: int, **kw) -> Event:
    return Event(name, at(start), at(end), **kw)


# ---------------------------------------------------------------- 読み取り


def test_終日の予定は日付だけで来る() -> None:
    assert parse_datetime("2026-08-20") == datetime(2026, 8, 20, 0, 0)


def test_末尾のZも読める() -> None:
    """Python の fromisoformat はこの綴りを読めないので、こちらで直す。"""
    assert parse_datetime("2026-08-20T10:00:00Z") == datetime(2026, 8, 20, 10, 0)


def test_APIの形から予定を組み立てられる() -> None:
    e = event_from_api({
        "id": "abc", "summary": "会議", "location": "渋谷",
        "start": {"dateTime": "2026-08-20T10:00:00+09:00"},
        "end": {"dateTime": "2026-08-20T11:00:00+09:00"},
    })
    assert e.summary == "会議" and e.event_id == "abc"
    assert e.duration == timedelta(hours=1)
    assert not e.all_day


def test_名前の無い予定にも呼び名を付ける() -> None:
    e = event_from_api({"start": {"date": "2026-08-20"}, "end": {"date": "2026-08-21"}})
    assert e.summary == "（名称未設定）" and e.all_day


# ---------------------------------------------------------------- 言い方


@pytest.mark.parametrize(("moment", "said"), [(at(14, 0), "14時"), (at(9, 30), "9時30分")])
def test_ちょうどの時刻は分を言わない(moment: datetime, said: str) -> None:
    assert say_time(moment) == said


def test_予定が無ければそう言う() -> None:
    assert describe_day([]) == "予定はありません。"


def test_件数を先に言い近いものから三件だけ挙げる() -> None:
    """全部読み上げると長い。残りは画面に出せばよい。"""
    events = [event(f"予定{i}", 10 + i, 11 + i) for i in range(5)]
    said = describe_day(events, now=at(9))
    assert said.startswith("予定は5件です。")
    assert "予定0" in said and "予定2" in said and "予定3" not in said
    assert "ほかに2件あります。" in said


def test_終わった予定は読み上げない() -> None:
    events = [event("済んだ会議", 9, 10), event("これから", 15, 16)]
    said = describe_day(events, now=at(12))
    assert "これから" in said and "済んだ会議" not in said


def test_全部終わっていれば件数だけ言う() -> None:
    said = describe_day([event("済んだ会議", 9, 10)], now=at(23))
    assert "1件" in said


def test_次の予定までの時間を言う() -> None:
    events = [event("会議", 10, 11)]
    assert describe_gap(events, now=at(9, 30)) == "次の会議まで30分です。"
    assert describe_gap(events, now=at(8, 0)) == "次の会議まで2時間です。"
    assert describe_gap(events, now=at(8, 15)) == "次の会議まで1時間45分です。"


def test_この先が無ければそう言う() -> None:
    assert describe_gap([event("会議", 10, 11)], now=at(12)) == "この先の予定はありません。"


# ---------------------------------------------------------------- 重なり


def test_重なっている予定を見つける() -> None:
    events = [event("会議", 10, 11), event("打合せ", 14, 15)]
    assert [e.summary for e in find_conflicts(events, at(10, 30), at(11, 30))] == ["会議"]


def test_隣り合うだけなら重ならない() -> None:
    """11時に終わる予定と11時に始まる予定は、重なっていない。"""
    assert find_conflicts([event("会議", 10, 11)], at(11), at(12)) == []


def test_終日の予定は重なりとみなさない() -> None:
    """終日といっても一日中埋まっているわけではない。"""
    all_day = Event("締切", at(0), datetime(2026, 8, 21), all_day=True)
    assert find_conflicts([all_day], at(10), at(11)) == []


def test_移動時間が足りない直前の予定を見つける() -> None:
    events = [event("外出", 13, 14, location="渋谷")]
    assert [e.summary for e in needs_travel_time(events, at(14, 10))] == ["外出"]


def test_場所が書かれていなければ移動を見ない() -> None:
    assert needs_travel_time([event("在宅会議", 13, 14)], at(14, 10)) == []


def test_十分に間が空いていれば何も言わない() -> None:
    events = [event("外出", 13, 14, location="渋谷")]
    assert needs_travel_time(events, at(15)) == []


# ---------------------------------------------------------------- 入れる前


def test_問題が無ければ黙って通す() -> None:
    assert check_before_create([event("会議", 10, 11)], at(14), at(15)) is None


def test_重なっていたら知らせる() -> None:
    warning = check_before_create([event("会議", 10, 11)], at(10, 30), at(11, 30))
    assert warning and "10時の会議と重なります" in warning


def test_移動が間に合わないことを知らせる() -> None:
    events = [event("外出", 13, 14, location="渋谷")]
    warning = check_before_create(events, at(14, 10), at(15))
    assert warning and "渋谷" in warning and "10分" in warning


def test_終わりが始まりより前なら弾く() -> None:
    warning = check_before_create([], at(15), at(14))
    assert warning and "終わりの時刻" in warning


def test_重なりが無ければ空文字を返す() -> None:
    assert describe_conflicts([]) == ""
