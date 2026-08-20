"""読み上げる文を、応答テキストから取り出して整える。

Claude の応答をそのまま読み上げると、箇条書きもコードも全部読んでしまって
使い物にならない。ジャービス用の CLAUDE.md では応答の先頭に
`<speak>…</speak>` を置く約束にしてあり、ここではそれを取り出す。
約束が破られたときのために、先頭の段落を代わりに読む道も残してある。
"""

from __future__ import annotations

import re

SPEAK_BLOCK = re.compile(r"<speak>(.*?)</speak>", re.DOTALL | re.IGNORECASE)

# 読み上げると邪魔になる記法。落としても意味は変わらないものだけ。
_CODE_FENCE = re.compile(r"```.*?```", re.DOTALL)
_INLINE_CODE = re.compile(r"`([^`]*)`")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_HEADING = re.compile(r"^#{1,6}\s*", re.MULTILINE)
_BULLET = re.compile(r"^\s*[-*+]\s+", re.MULTILINE)
_EMPHASIS = re.compile(r"(\*\*|__|\*|_)")
_URL = re.compile(r"https?://\S+")


def extract_speech(reply: str) -> str:
    """応答から、声に出す部分だけを取り出す。"""
    if not reply:
        return ""
    m = SPEAK_BLOCK.search(reply)
    if m:
        return clean_for_speech(m.group(1))
    return clean_for_speech(_first_paragraph(reply))


def _first_paragraph(reply: str) -> str:
    body = _CODE_FENCE.sub("", reply).strip()
    for block in body.split("\n\n"):
        stripped = block.strip()
        if stripped:
            return stripped
    return ""


def clean_for_speech(text: str) -> str:
    """記法を落として、声に出して自然な文にする。"""
    t = _CODE_FENCE.sub("、コードは画面に出しました、", text)
    t = _LINK.sub(r"\1", t)
    t = _URL.sub("リンク", t)
    t = _INLINE_CODE.sub(r"\1", t)
    t = _HEADING.sub("", t)
    t = _BULLET.sub("", t)
    t = _EMPHASIS.sub("", t)
    return " ".join(t.split())


def truncate_for_speech(text: str, limit: int) -> str:
    """長すぎる読み上げを切る。文の途中では切らない。"""
    if limit <= 0 or len(text) <= limit:
        return text
    head = text[:limit]
    for mark in ("。", "！", "？", ". ", "、"):
        cut = head.rfind(mark)
        if cut > limit // 3:
            return head[: cut + len(mark)].rstrip() + " 続きは画面に出しました。"
    return head.rstrip() + "… 続きは画面に出しました。"


def split_for_speech(text: str, chunk_chars: int = 120) -> list[str]:
    """句点で区切って、合成しながら喋れる長さに束ねる。

    全部を合成し終えてから喋りだすと、長い返事のときに間が空く。
    先頭から順に喋りだせるように、意味の切れ目で分けておく。
    """
    if not text.strip():
        return []
    sentences = re.findall(r"[^。！？!?]*[。！？!?]|[^。！？!?]+$", text)
    chunks: list[str] = []
    buf = ""
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if buf and len(buf) + len(s) > chunk_chars:
            chunks.append(buf)
            buf = s
        else:
            buf += s
    if buf:
        chunks.append(buf)
    return chunks
