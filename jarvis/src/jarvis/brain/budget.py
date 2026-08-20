"""Claude を呼びすぎないための自衛。

サブスクリプションの枠は Anthropic 側にしか見えないので、こちらは呼んだ回数を
自分で数えて、決めた本数を超えたら断る。断ることは黙って止まるより親切で、
枠を使い切って肝心なときに動かない、という失敗を防ぐ。
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config import BudgetConfig
from ..memory import db


@dataclass(frozen=True)
class BudgetStatus:
    used_today: int
    used_this_week: int
    limit_day: int
    limit_week: int

    @property
    def exhausted(self) -> bool:
        return self.used_today >= self.limit_day or self.used_this_week >= self.limit_week

    @property
    def remaining_today(self) -> int:
        return max(0, self.limit_day - self.used_today)

    @property
    def remaining_this_week(self) -> int:
        return max(0, self.limit_week - self.used_this_week)

    def describe(self) -> str:
        return (
            f"今日 {self.used_today}/{self.limit_day} 回、"
            f"今週 {self.used_this_week}/{self.limit_week} 回"
        )


class Budget:
    def __init__(self, conn: db.Connection, config: BudgetConfig) -> None:
        self._conn = conn
        self._config = config

    def status(self) -> BudgetStatus:
        return BudgetStatus(
            used_today=db.count_claude_calls(self._conn, within_days=1),
            used_this_week=db.count_claude_calls(self._conn, within_days=7),
            limit_day=self._config.max_calls_per_day,
            limit_week=self._config.max_calls_per_week,
        )

    def allows(self) -> bool:
        return not self.status().exhausted

    @property
    def refusal_message(self) -> str:
        return self._config.refusal_message

    def record(self, *, driver: str, prompt_chars: int, source: str = "voice") -> None:
        db.record_claude_call(
            self._conn, driver=driver, prompt_chars=prompt_chars, source=source
        )
