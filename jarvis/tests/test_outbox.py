"""頭からの返事を受け取る箱。取り違えと取りこぼしが起きないことを見る。"""

import threading

from jarvis.brain.outbox import Outbox


def test_印より後に来たものだけを拾う(tmp_path) -> None:
    box = Outbox(tmp_path / "outbox")
    box.put("前の会話の返事")
    marker = box.mark()
    box.put("今の返事")
    reply = box.wait(marker, timeout_sec=1.0)
    assert reply is not None and reply.text == "今の返事"


def test_遅れて届いても待っていれば拾える(tmp_path) -> None:
    box = Outbox(tmp_path / "outbox")
    marker = box.mark()
    threading.Timer(0.2, lambda: box.put("お待たせしました")).start()
    reply = box.wait(marker, timeout_sec=3.0)
    assert reply is not None and reply.text == "お待たせしました"


def test_来なければ待ち時間で諦める(tmp_path) -> None:
    box = Outbox(tmp_path / "outbox")
    assert box.wait(box.mark(), timeout_sec=0.3) is None


def test_一度拾った返事は二度出てこない(tmp_path) -> None:
    box = Outbox(tmp_path / "outbox")
    marker = box.mark()
    box.put("一度きり")
    assert box.wait(marker, timeout_sec=1.0) is not None
    assert box.wait(marker, timeout_sec=0.3) is None


def test_誰も待っていなかった返事を後から拾える(tmp_path) -> None:
    """長い作業の返事は待ち時間を過ぎてから来る。捨ててはいけない。"""
    box = Outbox(tmp_path / "outbox")
    box.put("時間のかかった返事")
    late = list(box.drain(older_than_sec=0.0))
    assert [r.text for r in late] == ["時間のかかった返事"]
    assert list(box.drain(older_than_sec=0.0)) == []


def test_出来たての返事は待っている側に譲る(tmp_path) -> None:
    """直後に drain すると、待っている駆動側から返事を横取りしてしまう。"""
    box = Outbox(tmp_path / "outbox")
    box.put("いま届いた")
    assert list(box.drain(older_than_sec=60.0)) == []


def test_壊れたファイルは捨てて先へ進む(tmp_path) -> None:
    box = Outbox(tmp_path / "outbox")
    marker = box.mark()
    broken = tmp_path / "outbox" / "20990101T000000000000.json"
    broken.write_text("{壊れている", encoding="utf-8")
    assert box.wait(marker, timeout_sec=0.5) is None
    assert not broken.exists()


def test_付随する情報も一緒に運ぶ(tmp_path) -> None:
    box = Outbox(tmp_path / "outbox")
    marker = box.mark()
    box.put("要点", session_id="abc", full="要点\n\n詳細")
    reply = box.wait(marker, timeout_sec=1.0)
    assert reply is not None
    assert reply.meta["session_id"] == "abc"
    assert "詳細" in reply.meta["full"]
