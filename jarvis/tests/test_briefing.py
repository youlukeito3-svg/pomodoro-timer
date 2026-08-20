"""毎朝の読み上げ。Claude を呼ばずに組み立てられることを確かめる。"""

from datetime import datetime, timedelta

import pytest

from jarvis.brain.agenda import Event
from jarvis.brain.briefing import compose
from jarvis.config import load_config


class FakeDesk:
    def __init__(self, events=None, unread="該当するメールはありません。", broken=False):
        self._events = events or []
        self._unread = unread
        self._broken = broken

    def events_between(self, start, end):
        if self._broken:
            raise RuntimeError("繋がりません")
        return self._events

    def search_mail(self, query, limit=10):
        return self._unread


@pytest.fixture()
def config(tmp_path):
    cfg = load_config()
    cfg.paths.data_dir = str(tmp_path)
    return cfg


def test_予定と未読をまとめて言う(config) -> None:
    now = datetime(2026, 8, 20, 7, 0)
    events = [Event("朝会", now.replace(hour=10), now.replace(hour=11))]
    said = compose(config, FakeDesk(events, unread="- a\n- b"), now=now)
    assert "おはようございます" in said
    assert "8月20日" in said
    assert "朝会" in said
    assert "未読のメールが2件" in said


def test_未読が無ければメールに触れない(config) -> None:
    said = compose(config, FakeDesk([]), now=datetime(2026, 8, 20, 7, 0))
    assert "未読" not in said
    assert "予定はありません" in said


def test_繋がらなくても黙らない(config) -> None:
    """何も言わないと、壊れているのか予定が無いのか分からない。"""
    said = compose(config, FakeDesk(broken=True), now=datetime(2026, 8, 20, 7, 0))
    assert "予定を読めませんでした" in said


@pytest.mark.parametrize(
    ("hour", "greeting"),
    [(2, "夜分"), (7, "おはようございます"), (14, "こんにちは"), (21, "こんばんは")],
)
def test_時間帯で挨拶が変わる(config, hour: int, greeting: str) -> None:
    said = compose(config, FakeDesk([]), now=datetime(2026, 8, 20, hour, 0))
    assert greeting in said
