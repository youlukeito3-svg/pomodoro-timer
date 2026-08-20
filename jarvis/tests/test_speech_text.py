"""読み上げる文の取り出し。声にしてはいけないものを落とせているかを見る。"""

import pytest

from jarvis.mouth.speech_text import (
    clean_for_speech, extract_speech, split_for_speech, truncate_for_speech,
)


def test_speak_ブロックがあればそこだけ読む() -> None:
    reply = "<speak>3件あります。</speak>\n\n## 詳細\n- 10時 会議\n- 14時 打ち合わせ"
    assert extract_speech(reply) == "3件あります。"


def test_speak_が無ければ先頭の段落を読む() -> None:
    reply = "了解しました。\n\n詳細は次のとおりです。\n- あれ\n- これ"
    assert extract_speech(reply) == "了解しました。"


def test_記法は落とす() -> None:
    assert clean_for_speech("**強調**と`コード`と[リンク](http://x)") == "強調とコードとリンク"


def test_URLは読み上げない() -> None:
    assert "http" not in clean_for_speech("詳細は https://example.com/very/long にあります")


def test_コードブロックは読まずに触れるだけ() -> None:
    spoken = extract_speech("<speak>直しました。```python\nprint(1)\n```</speak>")
    assert "print" not in spoken
    assert "画面" in spoken


def test_空の応答は空を返す() -> None:
    assert extract_speech("") == ""
    assert extract_speech("\n\n   \n") == ""


def test_長すぎる読み上げは文の切れ目で切る() -> None:
    text = "一文目です。" + "あ" * 200 + "。"
    out = truncate_for_speech(text, 60)
    assert out.endswith("続きは画面に出しました。")
    assert out.startswith("一文目です。")


def test_短ければ切らない() -> None:
    assert truncate_for_speech("短い。", 300) == "短い。"


def test_句点で束ねる() -> None:
    assert split_for_speech("あ。い。う。", chunk_chars=4) == ["あ。い。", "う。"]


def test_句点が無くても1つにまとまる() -> None:
    assert split_for_speech("句点のない文") == ["句点のない文"]


def test_空文字は喋る単位を作らない() -> None:
    assert split_for_speech("   ") == []


@pytest.mark.parametrize("tag", ["<speak>", "<SPEAK>", "<Speak>"])
def test_大文字小文字を問わない(tag: str) -> None:
    closing = tag.replace("<", "</")
    assert extract_speech(f"{tag}はい。{closing}") == "はい。"
