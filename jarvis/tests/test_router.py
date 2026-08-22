"""振り分け。ここが緩むとサブスク枠が溶けるので、境目を厚く見る。

Ollama は動いていない前提で、返ってきた中身の扱い方だけを確かめる。
"""

import json

import pytest

from jarvis.config import RouterConfig
from jarvis.brain.router import Router


@pytest.fixture()
def router() -> Router:
    return Router(RouterConfig())


def reply_from(router: Router, payload: object) -> str | None:
    """Ollama が payload を返してきたことにして、返事の取り出し方を見る。"""
    router._generate = lambda _p, *, json_mode=False: (  # noqa: SLF001
        payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    )
    return router._chitchat("ありがとう")  # noqa: SLF001


def test_返事はJSONから取り出す(router: Router) -> None:
    assert reply_from(router, {"reply": "お役に立てて幸いです。"}) == "お役に立てて幸いです。"


def test_前後の空白は落とす(router: Router) -> None:
    assert reply_from(router, {"reply": "  はい。  "}) == "はい。"


def test_考えごとが返ってきたら読み上げない(router: Router) -> None:
    """qwen3 のような推論するモデルは、放っておくと英語の考えを吐く。

    それをそのまま声に出すくらいなら、頭に回したほうがましなので None を返す。
    """
    assert reply_from(router, 'Okay, the user said "ありがとう" which means') is None


def test_返事が空なら読み上げない(router: Router) -> None:
    assert reply_from(router, {"reply": "   "}) is None
    assert reply_from(router, {}) is None


def test_返事が文字列でなければ読み上げない(router: Router) -> None:
    assert reply_from(router, {"reply": ["はい", "いいえ"]}) is None


def test_返事を作れなければ頭に回す(router: Router) -> None:
    """黙って終わるより、1本使ってでも答えるほうがよい。"""
    router._generate = lambda _p, *, json_mode=False: None  # noqa: SLF001
    route = router.route("ありがとう")
    assert route.destination == "claude"


def test_規則で決まる用事はOllamaを呼ばない(router: Router) -> None:
    """「今何時」を聞くたびに枠を1本使うのは馬鹿げている。"""
    called: list[str] = []
    router._generate = lambda p, *, json_mode=False: called.append(p)  # noqa: SLF001
    route = router.route("今何時")
    assert route.destination == "skill"
    assert called == []
