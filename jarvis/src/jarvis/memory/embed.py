"""埋め込み。文を意味で比べられる数値の並びにする。

Ollama にローカルで作らせるので、ここでも課金は発生しない。多言語モデルを
既定にしてあるのは、日本語と英語が混ざった記憶をまとめて扱うため。

Ollama が落ちているときは None を返す。埋め込みが無い断片は意味検索に
出てこないだけで、Markdown の正本は残るし、あとで作り直せる。
"""

from __future__ import annotations

import httpx

from ..config import MemoryConfig
from ..log import get_logger

log = get_logger("記憶")


class Embedder:
    def __init__(self, config: MemoryConfig, ollama_url: str) -> None:
        self._model = config.embed_model
        self._dim = config.embed_dim
        self._client = httpx.Client(base_url=ollama_url, timeout=30.0)
        self._warned = False

    @property
    def dim(self) -> int:
        return self._dim

    def embed(self, text: str) -> list[float] | None:
        vectors = self.embed_many([text])
        return vectors[0] if vectors else None

    def embed_many(self, texts: list[str]) -> list[list[float]] | None:
        if not texts:
            return []
        try:
            r = self._client.post("/api/embed", json={"model": self._model, "input": texts})
            r.raise_for_status()
            vectors = r.json().get("embeddings") or []
        except (httpx.HTTPError, ValueError) as e:
            if not self._warned:
                log.warning(
                    "埋め込みを作れません。意味検索は使えませんが記憶は残ります",
                    error=str(e), model=self._model,
                )
                self._warned = True
            return None

        if vectors and len(vectors[0]) != self._dim:
            # 設定の次元とモデルの次元が食い違うと、既存の記憶と比べられなくなる。
            log.error(
                "埋め込みの次元が設定と違います",
                設定=self._dim, モデル=len(vectors[0]),
                対処=f"jarvis.toml の embed_dim を {len(vectors[0])} にしてください",
            )
            return None
        self._warned = False
        return vectors

    def close(self) -> None:
        self._client.close()
