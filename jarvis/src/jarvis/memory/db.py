"""記憶の器。SQLite ひとつで済ませる。

sqlite-vec が入っていれば近傍検索をそれに任せ、入っていなければ Python 側で
総当たりのコサイン類似度に落ちる。記憶の正本は常に `chunks` テーブルなので、
どちらの経路でも結果は変わらない（速さだけが違う）。
"""

from __future__ import annotations

import json
import math
import sqlite3
import struct
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Sequence

SCHEMA_VERSION = 2

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 会話の1往復。source は voice / discord / cli。
CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,
    source      TEXT NOT NULL,
    heard       TEXT NOT NULL,
    reply       TEXT,
    route       TEXT NOT NULL,          -- local / claude / refused
    latency_ms  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_conversations_ts ON conversations(ts);

-- 覚えておくべき事実。journal から昇格させたものもここに入る。
CREATE TABLE IF NOT EXISTS facts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT NOT NULL,
    kind       TEXT NOT NULL,           -- preference / constraint / person / project / other
    text       TEXT NOT NULL,
    source_ref TEXT,
    superseded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_facts_kind ON facts(kind, superseded);

-- 予定の正本は Google カレンダー。ここにはメタ情報だけを置く。
CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    created_ts   TEXT NOT NULL,
    due_ts       TEXT,
    title        TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open',   -- open / done / dropped
    notes        TEXT,
    calendar_id  TEXT,
    event_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, due_ts);

-- PC を操作したことの全記録。何をして何を断ったかが後から追える。
CREATE TABLE IF NOT EXISTS action_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT NOT NULL,
    tool         TEXT NOT NULL,
    target_app   TEXT,
    window_title TEXT,
    payload      TEXT,
    decision     TEXT NOT NULL,         -- allowed / denied / confirm_required / confirmed
    reason       TEXT,
    screenshot   TEXT
);
CREATE INDEX IF NOT EXISTS idx_action_log_ts ON action_log(ts);

-- Claude を何回呼んだか。サブスク枠を守るための自衛用。
CREATE TABLE IF NOT EXISTS claude_usage (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT NOT NULL,
    driver       TEXT NOT NULL,
    prompt_chars INTEGER NOT NULL DEFAULT 0,
    source       TEXT
);
CREATE INDEX IF NOT EXISTS idx_claude_usage_ts ON claude_usage(ts);

-- 意味検索の対象。embedding は float32 のリトルエンディアン列。
CREATE TABLE IF NOT EXISTS chunks (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,
    kind      TEXT NOT NULL,            -- journal / fact / conversation / doc
    ref       TEXT,
    text      TEXT NOT NULL,
    embedding BLOB
);
CREATE INDEX IF NOT EXISTS idx_chunks_kind ON chunks(kind);

-- 索引に取り込んだ Markdown の状態。Obsidian などで人が直したノートを
-- 見つけ出すためだけに持つ。中身は更新時刻と大きさだけなので、消えても
-- 次の取り込みで作り直せる。
CREATE TABLE IF NOT EXISTS file_index (
    ref   TEXT PRIMARY KEY,
    mtime REAL NOT NULL,
    size  INTEGER NOT NULL
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def pack_embedding(vec: Sequence[float]) -> bytes:
    return struct.pack(f"<{len(vec)}f", *vec)


def unpack_embedding(blob: bytes) -> list[float]:
    return list(struct.unpack(f"<{len(blob) // 4}f", blob))


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if len(a) != len(b):
        return -1.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return -1.0
    return dot / (na * nb)


class Connection(sqlite3.Connection):
    """sqlite-vec を読めたかどうかを持たせたいだけの派生。

    素の sqlite3.Connection には属性を足せないので、接続の種類を型で表す。
    """

    has_vec: bool = False


def _try_load_vec(conn: sqlite3.Connection) -> bool:
    try:
        import sqlite_vec  # type: ignore
    except ImportError:
        return False
    try:
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        return True
    except (AttributeError, sqlite3.OperationalError):
        return False


def connect(db_path: Path, *, embed_dim: int = 1024) -> Connection:
    """接続してスキーマを整える。何度呼んでも安全。"""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False, factory=Connection)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)

    conn.has_vec = _try_load_vec(conn)
    if conn.has_vec:
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks "
            f"USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[{embed_dim}])"
        )
    conn.execute(
        "INSERT INTO meta(key, value) VALUES('schema_version', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (str(SCHEMA_VERSION),),
    )
    conn.commit()
    return conn


# ---------------------------------------------------------------- 書き込み

def record_conversation(
    conn: sqlite3.Connection, *, source: str, heard: str,
    reply: str | None, route: str, latency_ms: int | None = None,
) -> int:
    cur = conn.execute(
        "INSERT INTO conversations(ts, source, heard, reply, route, latency_ms) "
        "VALUES(?, ?, ?, ?, ?, ?)",
        (now_iso(), source, heard, reply, route, latency_ms),
    )
    conn.commit()
    return int(cur.lastrowid)


def record_action(
    conn: sqlite3.Connection, *, tool: str, decision: str,
    target_app: str | None = None, window_title: str | None = None,
    payload: object = None, reason: str | None = None, screenshot: str | None = None,
) -> int:
    cur = conn.execute(
        "INSERT INTO action_log(ts, tool, target_app, window_title, payload, "
        "decision, reason, screenshot) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
        (
            now_iso(), tool, target_app, window_title,
            json.dumps(payload, ensure_ascii=False, default=str) if payload is not None else None,
            decision, reason, screenshot,
        ),
    )
    conn.commit()
    return int(cur.lastrowid)


def record_claude_call(
    conn: sqlite3.Connection, *, driver: str, prompt_chars: int, source: str = "voice"
) -> None:
    conn.execute(
        "INSERT INTO claude_usage(ts, driver, prompt_chars, source) VALUES(?, ?, ?, ?)",
        (now_iso(), driver, prompt_chars, source),
    )
    conn.commit()


def count_claude_calls(conn: sqlite3.Connection, *, within_days: int) -> int:
    since = (datetime.now(timezone.utc) - timedelta(days=within_days)).isoformat(timespec="seconds")
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM claude_usage WHERE ts >= ?", (since,)
    ).fetchone()
    return int(row["n"])


def add_fact(
    conn: sqlite3.Connection, *, kind: str, text: str, source_ref: str | None = None
) -> int:
    cur = conn.execute(
        "INSERT INTO facts(ts, kind, text, source_ref) VALUES(?, ?, ?, ?)",
        (now_iso(), kind, text, source_ref),
    )
    conn.commit()
    return int(cur.lastrowid)


def upsert_chunk(
    conn: sqlite3.Connection, *, kind: str, text: str,
    embedding: Sequence[float] | None, ref: str | None = None,
) -> int:
    """同じ ref の断片があれば置き換える。journal の再取り込みで重複しないように。"""
    if ref is not None:
        old = conn.execute(
            "SELECT id FROM chunks WHERE kind = ? AND ref = ? AND text = ?", (kind, ref, text)
        ).fetchone()
        if old is not None:
            return int(old["id"])
    blob = pack_embedding(embedding) if embedding is not None else None
    cur = conn.execute(
        "INSERT INTO chunks(ts, kind, ref, text, embedding) VALUES(?, ?, ?, ?, ?)",
        (now_iso(), kind, ref, text, blob),
    )
    chunk_id = int(cur.lastrowid)
    if embedding is not None and getattr(conn, "has_vec", False):
        conn.execute(
            "INSERT INTO vec_chunks(chunk_id, embedding) VALUES(?, ?)", (chunk_id, blob)
        )
    conn.commit()
    return chunk_id


def forget_ref(conn: sqlite3.Connection, *, kind: str, ref: str) -> int:
    """ある出典に由来する断片をすべて消す。journal を作り直すときに使う。"""
    ids = [
        int(r["id"])
        for r in conn.execute("SELECT id FROM chunks WHERE kind = ? AND ref = ?", (kind, ref))
    ]
    if not ids:
        return 0
    marks = ",".join("?" * len(ids))
    if getattr(conn, "has_vec", False):
        conn.execute(f"DELETE FROM vec_chunks WHERE chunk_id IN ({marks})", ids)
    conn.execute(f"DELETE FROM chunks WHERE id IN ({marks})", ids)
    conn.commit()
    return len(ids)


def indexed_files(conn: sqlite3.Connection) -> dict[str, tuple[float, int]]:
    """取り込み済みの Markdown と、そのときの更新時刻・大きさ。"""
    return {
        r["ref"]: (float(r["mtime"]), int(r["size"]))
        for r in conn.execute("SELECT ref, mtime, size FROM file_index")
    }


def mark_indexed(conn: sqlite3.Connection, *, ref: str, mtime: float, size: int) -> None:
    conn.execute(
        "INSERT INTO file_index(ref, mtime, size) VALUES(?, ?, ?) "
        "ON CONFLICT(ref) DO UPDATE SET mtime = excluded.mtime, size = excluded.size",
        (ref, mtime, size),
    )
    conn.commit()


def forget_file(conn: sqlite3.Connection, *, ref: str) -> None:
    """取り込み済みの印を消す。ノートそのものが消えたときに使う。"""
    conn.execute("DELETE FROM file_index WHERE ref = ?", (ref,))
    conn.commit()


# ---------------------------------------------------------------- 読み出し

def search_chunks(
    conn: sqlite3.Connection, query_embedding: Sequence[float], *,
    top_k: int = 8, kinds: Iterable[str] | None = None,
) -> list[dict]:
    """近い順に断片を返す。score は 1.0 が最も近い。"""
    kind_list = list(kinds) if kinds else None

    if getattr(conn, "has_vec", False) and kind_list is None:
        rows = conn.execute(
            "SELECT c.id, c.ts, c.kind, c.ref, c.text, v.distance "
            "FROM vec_chunks v JOIN chunks c ON c.id = v.chunk_id "
            "WHERE v.embedding MATCH ? AND v.k = ? ORDER BY v.distance",
            (pack_embedding(query_embedding), top_k),
        ).fetchall()
        return [
            {
                "id": r["id"], "ts": r["ts"], "kind": r["kind"],
                "ref": r["ref"], "text": r["text"],
                "score": 1.0 / (1.0 + float(r["distance"])),
            }
            for r in rows
        ]

    sql = "SELECT id, ts, kind, ref, text, embedding FROM chunks WHERE embedding IS NOT NULL"
    params: list[object] = []
    if kind_list:
        sql += f" AND kind IN ({','.join('?' * len(kind_list))})"
        params.extend(kind_list)
    scored = []
    for r in conn.execute(sql, params):
        score = cosine(query_embedding, unpack_embedding(r["embedding"]))
        scored.append(
            {"id": r["id"], "ts": r["ts"], "kind": r["kind"],
             "ref": r["ref"], "text": r["text"], "score": score}
        )
    scored.sort(key=lambda d: d["score"], reverse=True)
    return scored[:top_k]


def recent_conversations(conn: sqlite3.Connection, limit: int = 10) -> list[dict]:
    rows = conn.execute(
        "SELECT ts, source, heard, reply, route FROM conversations ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in reversed(rows)]


def active_facts(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    rows = conn.execute(
        "SELECT ts, kind, text FROM facts WHERE superseded = 0 ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]
