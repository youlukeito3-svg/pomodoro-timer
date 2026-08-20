"""Claude を呼ばずに済ませる用事。

「今何時」を聞くたびにサブスク枠を1本使うのは馬鹿げている。ここに並ぶのは
その場で答えが決まるものだけで、判定はすべて規則で書いてある。曖昧なものを
無理にここへ入れてはいけない。迷ったら頭（Claude）に回すのが正しい。

一致の判定は純粋な関数なので、音も PC も無しでテストできる。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

# ---------------------------------------------------------------- 返事の型


@dataclass(frozen=True)
class SkillResult:
    text: str
    # 直前の確認への返事だった場合に立つ。pipeline がこれを見て操作を再開する。
    confirm: bool | None = None
    # 読み上げを止めるなど、副作用の指示。
    command: str | None = None


@dataclass(frozen=True)
class Skill:
    name: str
    match: Callable[[str], dict | None]
    run: Callable[[dict], SkillResult]


def _normalize(text: str) -> str:
    """判定用に文を均す。句読点と空白は落とす。"""
    return re.sub(r"[\s、。！？!?,.]+", "", text)


# ---------------------------------------------------------------- 時刻と日付

_TIME_RE = re.compile(r"(今|いま)?(何時|なんじ|時間|時刻)")
_DATE_RE = re.compile(r"(今日|きょう|本日).{0,3}(何日|なんにち|日付|何曜日|なんようび)")
_WEEKDAYS = "月火水木金土日"


def _match_time(text: str) -> dict | None:
    flat = _normalize(text)
    # 「1時間タイマー」の「時間」を時刻の問いと取り違えない。
    if _DATE_RE.search(flat) or _TIMER_RE.search(flat):
        return None
    return {} if _TIME_RE.search(flat) else None


def _run_time(_args: dict) -> SkillResult:
    now = datetime.now()
    return SkillResult(f"{now.hour}時{now.minute}分です。")


def _match_date(text: str) -> dict | None:
    return {} if _DATE_RE.search(_normalize(text)) else None


def _run_date(_args: dict) -> SkillResult:
    now = datetime.now()
    return SkillResult(
        f"{now.month}月{now.day}日、{_WEEKDAYS[now.weekday()]}曜日です。"
    )


# ---------------------------------------------------------------- タイマー

_NUM = r"(\d+|[一二三四五六七八九十]+)"
_TIMER_RE = re.compile(rf"{_NUM}(分|時間|秒).{{0,4}}(タイマー|測って|計って|はかって|セット)")
_KANJI = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def _to_int(token: str) -> int:
    if token.isdigit():
        return int(token)
    if token == "十":
        return 10
    if token.startswith("十"):
        return 10 + _KANJI.get(token[1:], 0)
    if token.endswith("十"):
        return _KANJI.get(token[:-1], 0) * 10
    if "十" in token:
        tens, _, ones = token.partition("十")
        return _KANJI.get(tens, 1) * 10 + _KANJI.get(ones, 0)
    return _KANJI.get(token, 0)


def _match_timer(text: str) -> dict | None:
    m = _TIMER_RE.search(_normalize(text))
    if not m:
        return None
    amount = _to_int(m.group(1))
    if amount <= 0:
        return None
    unit = {"秒": 1, "分": 60, "時間": 3600}[m.group(2)]
    return {"seconds": amount * unit, "label": f"{m.group(1)}{m.group(2)}"}


def _run_timer(args: dict) -> SkillResult:
    return SkillResult(
        f"{args['label']}のタイマーをかけました。",
        command=f"timer:{args['seconds']}",
    )


# ---------------------------------------------------------------- 中断と確認

_STOP_RE = re.compile(r"^(ストップ|すとっぷ|止まって|とまって|黙って|だまって|やめて|中止)")
_YES_RE = re.compile(r"^(はい|うん|そう|お願い|おねがい|やって|いいよ|オーケー|オッケー|了解)")
_NO_RE = re.compile(r"^(いいえ|いや|違う|ちがう|やめて|だめ|ダメ|中止|キャンセル)")


def _match_stop(text: str) -> dict | None:
    return {} if _STOP_RE.match(_normalize(text)) else None


def _run_stop(_args: dict) -> SkillResult:
    return SkillResult("", command="stop")


def _match_yes(text: str) -> dict | None:
    flat = _normalize(text)
    # 「はい、それでお願いします」までは返事。長い文は指示とみなす。
    return {} if _YES_RE.match(flat) and len(flat) <= 12 else None


def _run_yes(_args: dict) -> SkillResult:
    return SkillResult("", confirm=True)


def _match_no(text: str) -> dict | None:
    flat = _normalize(text)
    return {} if _NO_RE.match(flat) and len(flat) <= 12 else None


def _run_no(_args: dict) -> SkillResult:
    return SkillResult("やめておきます。", confirm=False)


# ---------------------------------------------------------------- 一覧

# 並び順に意味がある。狭い判定を先に置く。「1時間タイマー」は時刻の問いではない。
SKILLS: list[Skill] = [
    Skill("stop", _match_stop, _run_stop),
    Skill("yes", _match_yes, _run_yes),
    Skill("no", _match_no, _run_no),
    Skill("timer", _match_timer, _run_timer),
    Skill("date", _match_date, _run_date),
    Skill("time", _match_time, _run_time),
]


def find_skill(text: str) -> tuple[Skill, dict] | None:
    """当てはまる用事があれば返す。無ければ None（＝頭に回す）。"""
    for skill in SKILLS:
        args = skill.match(text)
        if args is not None:
            return skill, args
    return None
