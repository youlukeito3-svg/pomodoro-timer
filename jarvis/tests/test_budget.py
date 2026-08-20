"""サブスク枠の自衛。上限に達したら断る、という一点を確かめる。"""

from jarvis.brain.budget import Budget
from jarvis.config import BudgetConfig
from jarvis.memory import db


def _budget(tmp_path, **kw):
    conn = db.connect(tmp_path / "b.db", embed_dim=4)
    cfg = BudgetConfig(**{"max_calls_per_day": 3, "max_calls_per_week": 5, **kw})
    return conn, Budget(conn, cfg)


def test_使っていなければ通る(tmp_path) -> None:
    _, budget = _budget(tmp_path)
    assert budget.allows()


def test_日の上限に達したら断る(tmp_path) -> None:
    _, budget = _budget(tmp_path)
    for _ in range(3):
        budget.record(driver="tmux", prompt_chars=1)
    assert not budget.allows()
    assert budget.status().remaining_today == 0


def test_週の上限が日の上限より先に効くこともある(tmp_path) -> None:
    _, budget = _budget(tmp_path, max_calls_per_day=100, max_calls_per_week=2)
    for _ in range(2):
        budget.record(driver="tmux", prompt_chars=1)
    assert not budget.allows()


def test_残り本数が読める(tmp_path) -> None:
    _, budget = _budget(tmp_path)
    budget.record(driver="tmux", prompt_chars=1)
    s = budget.status()
    assert s.remaining_today == 2
    assert "今日 1/3 回" in s.describe()
