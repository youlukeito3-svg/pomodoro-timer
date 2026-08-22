"""振り分け。この用事に頭（Claude）が要るかどうかを決める。

ここがサブスク枠の消費を実質的に決めている。順序は次のとおり。

1. 規則で決まる用事（時刻・タイマー・返事）は、その場で済ませる。
2. 雑談や短い相槌は、ローカルの小型 LLM に答えさせる。
3. それ以外は頭に回す。

判断に迷ったら頭に回す。ローカルで無理に答えて的外れなことを言うより、
1本使ってでも正しく答えるほうがよい。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Literal

import httpx

from ..config import RouterConfig
from ..log import get_logger
from .local_skills import Skill, find_skill

log = get_logger("振り分け")

Destination = Literal["skill", "chitchat", "claude"]

CLASSIFY_PROMPT = """あなたは音声アシスタントの受付です。
利用者の発話が、次のどちらに当たるかを判定してください。

- "chitchat": 挨拶・相槌・感謝・雑談など、その場で一言返せば済むもの
- "work": 調べ物、予定の確認や作成、ファイルやアプリの操作、
          プログラムの作成、複数の手順が要ること

迷ったら "work" を選んでください。

JSON だけを出力してください。形式: {"kind": "chitchat" | "work"}

発話: """

# 返事も JSON で受け取る。qwen3 のような推論する小型モデルは、そのまま
# 書かせると「Okay, the user said ...」という英語の考えごとを先に吐き、
# それが上限字数で切れて返事として出てくる。JSON の形に縛ると考えを挟む
# 余地が無くなり、速さも 2秒から 0.3秒あたりまで縮む。
REPLY_PROMPT = """あなたは「ジャービス」という名前の、日本語で話す執事です。
落ち着いた口調で、1文か2文だけで短く返します。絵文字と記号は使いません。
考えを書かず、返事だけを日本語で書いてください。

JSON だけを出力してください。形式: {"reply": "返事の文"}

発話: """


@dataclass(frozen=True)
class Route:
    destination: Destination
    reason: str
    skill: Skill | None = None
    args: dict | None = None
    reply: str | None = None   # chitchat のとき、そのまま返せる文


class Router:
    def __init__(self, config: RouterConfig) -> None:
        self._config = config
        self._client = httpx.Client(base_url=config.ollama_url, timeout=config.timeout_sec)
        self._ollama_ok = True

    def route(self, text: str) -> Route:
        hit = find_skill(text)
        if hit is not None:
            skill, args = hit
            return Route("skill", f"規則に当てはまりました（{skill.name}）", skill=skill, args=args)

        kind = self._classify(text)
        if kind == "chitchat":
            reply = self._chitchat(text)
            if reply:
                return Route("chitchat", "その場で返せる話です", reply=reply)
            # 一言も返せないなら、黙るより頭に回す。
            return Route("claude", "ローカルで返事を作れませんでした")

        return Route("claude", "頭が要る用事です")

    # ------------------------------------------------------------ Ollama

    def _classify(self, text: str) -> str:
        raw = self._generate(CLASSIFY_PROMPT + text, json_mode=True)
        if raw is None:
            return "work" if self._config.fallback_to_claude else "chitchat"
        try:
            kind = json.loads(raw).get("kind")
        except (json.JSONDecodeError, AttributeError):
            log.debug("分類の結果を読めませんでした", raw=raw[:120])
            return "work"
        return "chitchat" if kind == "chitchat" else "work"

    def _chitchat(self, text: str) -> str | None:
        raw = self._generate(REPLY_PROMPT + text, json_mode=True)
        if not raw:
            return None
        try:
            reply = json.loads(raw).get("reply")
        except (json.JSONDecodeError, AttributeError):
            log.debug("返事の形を読めませんでした", raw=raw[:120])
            return None
        # 文字列以外が入っていたら、無理に読み上げず頭に回す。
        if not isinstance(reply, str) or not reply.strip():
            return None
        return reply.strip()

    def _generate(self, prompt: str, *, json_mode: bool = False) -> str | None:
        payload: dict = {
            "model": self._config.model,
            "prompt": prompt,
            "stream": False,
            # 考えを喋らせない。受付に長考は要らない。
            "think": False,
            "options": {"temperature": 0.2, "num_predict": 200},
        }
        if json_mode:
            payload["format"] = "json"
        try:
            r = self._client.post("/api/generate", json=payload)
            r.raise_for_status()
            if not self._ollama_ok:
                log.info("振り分けが復帰しました")
                self._ollama_ok = True
            return r.json().get("response", "")
        except (httpx.HTTPError, json.JSONDecodeError) as e:
            if self._ollama_ok:
                # 落ちていること自体は致命的ではない。全部頭に回るだけ。
                log.warning("振り分けが使えません。すべて頭に回します", error=str(e))
                self._ollama_ok = False
            return None

    def close(self) -> None:
        self._client.close()
