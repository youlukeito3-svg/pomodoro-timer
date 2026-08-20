"""診断。課金の経路を見つけたら必ず fatal になることを確かめる。"""

import pytest

from jarvis import doctor


def test_環境が綺麗なら通る() -> None:
    checks = doctor.check_billing_paths({})
    assert [c.level for c in checks] == ["ok"]


@pytest.mark.parametrize("var", doctor.BILLING_ENV_VARS)
def test_課金につながる変数はすべて起動を止める(var: str) -> None:
    checks = doctor.check_billing_paths({var: "1"})
    assert doctor.blocking_failures(checks)


def test_空文字なら課金経路とみなさない() -> None:
    """未設定と空文字は同じ扱いにする。空文字では認証が通らないため。"""
    checks = doctor.check_billing_paths({"ANTHROPIC_API_KEY": ""})
    assert not doctor.blocking_failures(checks)


def test_報告に直し方が載る() -> None:
    checks = doctor.check_billing_paths({"ANTHROPIC_API_KEY": "sk-test"})
    report = doctor.format_report(checks)
    assert "ANTHROPIC_API_KEY" in report
    assert "起動しません" in report
