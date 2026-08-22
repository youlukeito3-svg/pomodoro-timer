"""思い出す仕組み。Ollama が無くても記憶が失われないことを見る。"""

import pytest

from jarvis.config import load_config
from jarvis.memory import db
from jarvis.memory.recall import Memory, Recollection, split_markdown, strip_frontmatter


@pytest.fixture()
def config(tmp_path):
    cfg = load_config()
    cfg.paths.data_dir = str(tmp_path)
    cfg.ensure_dirs()
    return cfg


@pytest.fixture()
def memory(config) -> Memory:
    """Ollama は動いていない前提。埋め込みは作れない。"""
    return Memory(config)


# ------------------------------------------------------------ 断片への割り方


def test_見出しは断片の先頭に残る() -> None:
    """断片だけを見て「何の話か」が分かるようにする。"""
    chunks = split_markdown("# 人\n\n## 好み\n\nコーヒーはブラック。")
    assert chunks == ["好み: コーヒーはブラック。"]


def test_長い節は分かれる() -> None:
    body = "\n\n".join("あ" * 100 for _ in range(5))
    assert len(split_markdown(f"# 見出し\n\n{body}", chunk_chars=200)) > 1


def test_空の文書は断片を作らない() -> None:
    assert split_markdown("") == []
    assert split_markdown("# 見出しだけ") == []


# ------------------------------------------------------------ frontmatter


def test_Obsidianのメタ情報は記憶に混ざらない() -> None:
    """`status: 進行中` を本文として覚えると、思い出す内容が濁る。"""
    chunks = split_markdown("---\nstatus: 進行中\ntags: [仕事]\n---\n\n# 家計簿\n\n画面ができた。")
    assert chunks == ["家計簿: 画面ができた。"]


def test_メタ情報だけの文書は断片を作らない() -> None:
    assert split_markdown("---\ntags: [空]\n---\n") == []


def test_途中の区切り線は消さない() -> None:
    """本文中の `---` は区切り線であって、メタ情報ではない。"""
    assert "後半" in "".join(split_markdown("# 話\n\n前半\n\n---\n\n後半"))


def test_メタ情報が無ければそのまま() -> None:
    assert strip_frontmatter("# ふつうの見出し\n") == "# ふつうの見出し\n"


# ------------------------------------------------------------ 覚えると引く


def test_覚えたことは事実として残る(memory: Memory) -> None:
    assert "覚えました" in memory.remember("コーヒーはブラック", kind="preference")
    assert memory.recall("飲み物").facts == ["コーヒーはブラック"]


def test_空を覚えさせようとしても何も起きない(memory: Memory) -> None:
    memory.remember("   ")
    assert memory.recall("何か").facts == []


def test_人物像にも書き足せる(memory: Memory) -> None:
    memory.remember("辛いものが苦手", kind="preference", to_profile=True)
    assert "辛いものが苦手" in memory.vault.read_profile()


def test_埋め込みが作れなくても記憶は残る(memory: Memory) -> None:
    """Ollama が落ちていても、正本の Markdown と事実は失われない。"""
    memory.journal("家計簿アプリの土台を作った")
    assert "家計簿アプリ" in memory.vault.recent_journal()


def test_日誌は索引にも入る(memory: Memory, config) -> None:
    memory.journal("朝の散歩をした")
    conn = db.connect(config.paths.db, embed_dim=config.memory.embed_dim)
    rows = conn.execute("SELECT text FROM chunks WHERE kind = 'doc'").fetchall()
    assert any("朝の散歩" in r["text"] for r in rows)


def test_索引は入れ直しても増えない(memory: Memory, config) -> None:
    """作り直すたびに断片が二重になると、思い出す内容が偏る。"""
    memory.journal("同じ話")
    first = memory.reindex()
    second = memory.reindex()
    assert first == second
    conn = db.connect(config.paths.db, embed_dim=config.memory.embed_dim)
    count = conn.execute("SELECT COUNT(*) FROM chunks WHERE kind = 'doc'").fetchone()[0]
    assert count == first


# ------------------------------------------------ 手で書き換えたものを取り込む


def chunk_texts(config) -> list[str]:
    conn = db.connect(config.paths.db, embed_dim=config.memory.embed_dim)
    rows = conn.execute("SELECT text FROM chunks WHERE kind = 'doc'").fetchall()
    return [r["text"] for r in rows]


def test_手で直したノートが取り込まれる(memory: Memory, config) -> None:
    """Obsidian で直した内容が、次に思い出すときから効くこと。"""
    note = memory.vault.root / "覚え書き.md"
    note.write_text("# 覚え書き\n\nコーヒーはブラック。", encoding="utf-8")
    memory.refresh()
    assert any("ブラック" in t for t in chunk_texts(config))

    note.write_text("# 覚え書き\n\nやっぱり砂糖を入れることにした。", encoding="utf-8")
    memory.refresh()
    texts = chunk_texts(config)
    assert any("砂糖" in t for t in texts)
    assert not any("ブラック" in t for t in texts)


def test_変わっていなければ読み直さない(memory: Memory, monkeypatch) -> None:
    """毎回すべて読み直すと、埋め込みを作り直す分だけ重くなる。"""
    (memory.vault.root / "覚え書き.md").write_text("# 覚え書き\n\n本文", encoding="utf-8")
    memory.refresh()

    read: list[str] = []
    original = memory.index_file
    monkeypatch.setattr(
        memory, "index_file", lambda p: (read.append(p.name), original(p))[1]
    )
    assert memory.refresh() == 0
    assert read == []


def test_消したノートは思い出さなくなる(memory: Memory, config) -> None:
    """Obsidian で消したノートを、まだあるかのように思い出さないこと。"""
    note = memory.vault.root / "捨てる予定.md"
    note.write_text("# 捨てる予定\n\n古い決めごと。", encoding="utf-8")
    memory.refresh()
    assert any("古い決めごと" in t for t in chunk_texts(config))

    note.unlink()
    memory.refresh()
    assert not any("古い決めごと" in t for t in chunk_texts(config))


def test_進行中の仕事は思い出しに載る(memory: Memory) -> None:
    memory.vault.write_project("家計簿", "# 家計簿\n\n画面ができた")
    assert "家計簿" in memory.recall("進捗は").projects


# ------------------------------------------------------------ 頭に渡す形


def test_何も無ければ何も渡さない() -> None:
    """思い出せなかったときに空の枠を渡すと、その分だけ枠を無駄に食う。"""
    assert Recollection([], [], []).as_prompt() == ""


def test_思い出したものは枠に収めて渡す() -> None:
    prompt = Recollection(["ブラック派"], ["朝は6時に起きる"], ["家計簿"]).as_prompt()
    assert prompt.startswith("<記憶>") and prompt.endswith("</記憶>")
    assert "ブラック派" in prompt and "家計簿" in prompt
