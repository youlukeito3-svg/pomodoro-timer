"""Claude を呼ばずに済ませる用事。ここが緩むと余計な用事まで頭に回る。"""

import pytest

from jarvis.brain.local_skills import find_skill


def name_of(text: str) -> str | None:
    hit = find_skill(text)
    return hit[0].name if hit else None


@pytest.mark.parametrize("text", ["今何時？", "いま何時", "時刻を教えて"])
def test_時刻を聞かれたら頭を使わない(text: str) -> None:
    assert name_of(text) == "time"


@pytest.mark.parametrize("text", ["今日は何日", "今日何曜日だっけ", "本日の日付は"])
def test_日付は時刻と取り違えない(text: str) -> None:
    assert name_of(text) == "date"


@pytest.mark.parametrize(
    ("text", "seconds"),
    [("3分タイマー", 180), ("五分測って", 300), ("30秒はかって", 30),
     ("1時間タイマーセット", 3600), ("十分タイマー", 600), ("十五分測って", 900)],
)
def test_タイマーの長さを読み取る(text: str, seconds: int) -> None:
    hit = find_skill(text)
    assert hit is not None and hit[1]["seconds"] == seconds


def test_ゼロ分のタイマーは受け付けない() -> None:
    assert name_of("0分タイマー") is None


@pytest.mark.parametrize("text", ["ストップ", "黙って", "止まって"])
def test_中断はその場で効く(text: str) -> None:
    assert name_of(text) == "stop"


@pytest.mark.parametrize("text", ["はい", "うん", "お願いします", "了解"])
def test_短い肯定は返事とみなす(text: str) -> None:
    assert name_of(text) == "yes"


def test_長い文は返事ではなく指示とみなす() -> None:
    """「はい」で始まっていても、続きがあるなら用事が入っている。"""
    assert name_of("はい、それでは明日の会議の資料をまとめておいてください") is None


@pytest.mark.parametrize(
    "text",
    ["明日の会議の資料を作って", "今日の予定を教えて", "このバグを直して",
     "天気はどう", "新しいシステムを作りたい"],
)
def test_本当の用事は頭に回す(text: str) -> None:
    assert name_of(text) is None
