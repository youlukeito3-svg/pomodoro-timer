"""思い出す・覚える。

頭（Claude）から見た記憶の窓口はここ一つ。SQLite の索引と Markdown の正本を
束ねて、「この話に関係のある過去」を短くまとめて返す。

短くまとめることが肝心で、思い出したこと全部を頭に渡すと、毎回の指示が
膨らんでサブスク枠を余計に食う。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from ..config import Config
from ..log import get_logger
from . import db
from .embed import Embedder
from .vault import Vault, VaultGit

log = get_logger("記憶")

# 1つの断片の目安。長すぎると検索が粗くなり、短すぎると文脈が切れる。
CHUNK_CHARS = 400


def split_markdown(text: str, chunk_chars: int = CHUNK_CHARS) -> list[str]:
    """Markdown を、意味の切れ目で断片に割る。

    見出しと空行を切れ目とみなす。見出しは次の断片の先頭に残すので、
    「どの話の一部か」が断片だけを見ても分かる。
    """
    chunks: list[str] = []
    current: list[str] = []
    heading = ""
    length = 0

    for block in re.split(r"\n\s*\n", text):
        block = block.strip()
        if not block:
            continue
        if block.startswith("#"):
            if current:
                chunks.append("\n\n".join(current))
                current, length = [], 0
            heading = block.splitlines()[0].lstrip("# ").strip()
            continue
        piece = f"{heading}: {block}" if heading else block
        if current and length + len(piece) > chunk_chars:
            chunks.append("\n\n".join(current))
            current, length = [], 0
        current.append(piece)
        length += len(piece)

    if current:
        chunks.append("\n\n".join(current))
    return [c for c in chunks if c.strip()]


@dataclass(frozen=True)
class Recollection:
    facts: list[str]
    passages: list[str]
    projects: list[str]

    @property
    def empty(self) -> bool:
        return not (self.facts or self.passages)

    def as_prompt(self) -> str:
        """頭に渡せる形にまとめる。何も無ければ空文字。"""
        if self.empty:
            return ""
        parts = ["<記憶>"]
        if self.facts:
            parts.append("覚えていること:")
            parts += [f"- {f}" for f in self.facts]
        if self.passages:
            parts.append("関係のありそうな過去:")
            parts += [f"- {p}" for p in self.passages]
        if self.projects:
            parts.append(f"進行中: {'、'.join(self.projects)}")
        parts.append("</記憶>")
        return "\n".join(parts)


class Memory:
    def __init__(self, config: Config, conn: db.Connection | None = None) -> None:
        self._config = config
        self._conn = conn or db.connect(config.paths.db, embed_dim=config.memory.embed_dim)
        self._vault = Vault(config.paths.vault)
        self._git = VaultGit(config.paths.data)
        self._embedder = Embedder(config.memory, config.brain.router.ollama_url)
        self._vault.ensure()

    @property
    def conn(self) -> db.Connection:
        """同じ帳簿を手や予定にも使わせる。記録が二重の場所に散らない。"""
        return self._conn

    @property
    def vault(self) -> Vault:
        return self._vault

    @property
    def git(self) -> VaultGit:
        return self._git

    # ---------------------------------------------------------------- 思い出す

    def recall(self, query: str, *, top_k: int | None = None) -> Recollection:
        top_k = top_k or self._config.memory.top_k
        facts = [f["text"] for f in db.active_facts(self._conn, limit=12)]

        passages: list[str] = []
        vector = self._embedder.embed(query)
        if vector is not None:
            hits = db.search_chunks(self._conn, vector, top_k=top_k)
            # 似ていないものまで並べると、かえって邪魔になる。
            passages = [h["text"] for h in hits if h["score"] >= 0.4]

        return Recollection(
            facts=facts, passages=passages, projects=self._vault.list_projects()[:8]
        )

    # ---------------------------------------------------------------- 覚える

    def remember(self, text: str, *, kind: str = "other", to_profile: bool = False) -> str:
        """次に活きる情報を残す。会話の逐語録はここに入れない。"""
        text = text.strip()
        if not text:
            return "覚えることがありませんでした。"
        db.add_fact(self._conn, kind=kind, text=text)
        db.upsert_chunk(
            self._conn, kind="fact", text=text,
            embedding=self._embedder.embed(text), ref=None,
        )
        if to_profile:
            self._vault.append_profile(text)
        return f"覚えました: {text}"

    def journal(self, text: str) -> str:
        path = self._vault.append_journal(text)
        self.index_file(path)
        return f"{path.name} に書きました。"

    # ---------------------------------------------------------------- 索引

    def index_file(self, path: Path) -> int:
        """1つの Markdown を索引に入れ直す。"""
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as e:
            log.warning("読めませんでした", path=str(path), error=str(e))
            return 0

        ref = str(path.relative_to(self._vault.root)) if path.is_relative_to(self._vault.root) else str(path)
        chunks = split_markdown(text)
        # 作り直しなので、まず古い断片を捨てる。
        db.forget_ref(self._conn, kind="doc", ref=ref)
        if not chunks:
            return 0

        vectors = self._embedder.embed_many(chunks)
        for i, chunk in enumerate(chunks):
            db.upsert_chunk(
                self._conn, kind="doc", text=chunk, ref=ref,
                embedding=vectors[i] if vectors else None,
            )
        return len(chunks)

    def reindex(self) -> int:
        total = 0
        for path in self._vault.markdown_files():
            total += self.index_file(path)
        log.info("記憶を索引し直しました", 断片=total)
        return total

    # ---------------------------------------------------------------- 保存

    def sync(self) -> bool:
        return self._git.sync()

    def close(self) -> None:
        self._embedder.close()
