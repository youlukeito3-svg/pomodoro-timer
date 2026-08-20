"""外出先からの受付。持ち主以外の指示で自宅の PC が動かないことを厚く見る。"""

from types import SimpleNamespace

import pytest

from jarvis.remote.discord_bot import chunk_message, should_handle

ME = SimpleNamespace(id=1)
OWNER = 42
CHANNELS = [777]


def message(author_id: int, *, content="やあ", channel_id=777, dm=False, attachments=()):
    channel = SimpleNamespace(id=channel_id, guild=None if dm else SimpleNamespace(id=9))
    return SimpleNamespace(
        author=SimpleNamespace(id=author_id), content=content,
        channel=channel, attachments=list(attachments),
    )


def handle(msg, *, owner=OWNER, channels=None) -> bool:
    return should_handle(
        msg, owner_user_id=owner, channel_ids=CHANNELS if channels is None else channels, me=ME
    )


def test_持ち主のDMには応える() -> None:
    assert handle(message(OWNER, dm=True))


def test_決めたチャンネルなら応える() -> None:
    assert handle(message(OWNER, channel_id=777))


def test_他人の指示では動かない() -> None:
    """ここが唯一の関門。抜けると、誰でも自宅の PC を動かせてしまう。"""
    assert not handle(message(999, dm=True))


def test_自分の発言には反応しない() -> None:
    assert not handle(message(ME.id, dm=True))


def test_決めていないチャンネルでは動かない() -> None:
    assert not handle(message(OWNER, channel_id=123))


def test_中身が無ければ動かない() -> None:
    assert not handle(message(OWNER, content="", dm=True))


def test_音声メモだけでも受け取る() -> None:
    assert handle(message(OWNER, content="", dm=True, attachments=[object()]))


def test_持ち主を決めていなければDMは通す() -> None:
    """設定を書き忘れたときに使えなくなるより、DM だけは通す。"""
    assert handle(message(999, dm=True), owner=0)


# ------------------------------------------------------------ 長い返事


def test_短ければ割らない() -> None:
    assert chunk_message("短い返事") == ["短い返事"]


def test_長い返事は上限で割る() -> None:
    chunks = chunk_message("\n".join("あ" * 100 for _ in range(50)), limit=500)
    assert len(chunks) > 1
    assert all(len(c) <= 500 for c in chunks)
    assert "".join(chunks).replace("\n", "") == "あ" * 5000


def test_改行の無い長い一行も割れる() -> None:
    chunks = chunk_message("あ" * 1200, limit=500)
    assert all(len(c) <= 500 for c in chunks)
    assert "".join(chunks) == "あ" * 1200


def test_空なら何も送らない() -> None:
    assert chunk_message("") == []
