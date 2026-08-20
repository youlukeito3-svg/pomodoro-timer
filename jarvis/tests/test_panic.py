"""緊急停止。別プロセスから見えることが肝なので、ファイルで確かめる。"""

from jarvis.safety.panic import PanicSwitch


def test_止めて戻せる(tmp_path) -> None:
    switch = PanicSwitch(tmp_path)
    assert not switch.engaged
    switch.engage("声で停止")
    assert switch.engaged
    assert switch.reason() == "声で停止"
    switch.release()
    assert not switch.engaged


def test_別のインスタンスからも見える(tmp_path) -> None:
    PanicSwitch(tmp_path).engage("ホットキー")
    assert PanicSwitch(tmp_path).engaged


def test_止まっていなければ解除しても何も起きない(tmp_path) -> None:
    switch = PanicSwitch(tmp_path)
    switch.release()
    assert not switch.engaged
    assert switch.reason() is None
