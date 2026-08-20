"""記憶の器。sqlite-vec が無い環境でも同じ答えが返ることを確かめる。"""

import pytest

from jarvis.memory import db


@pytest.fixture()
def conn(tmp_path):
    return db.connect(tmp_path / "jarvis.db", embed_dim=4)


def test_会話を記録して読み戻せる(conn) -> None:
    db.record_conversation(conn, source="voice", heard="おはよう", reply="おはようございます", route="local")
    rows = db.recent_conversations(conn)
    assert rows[-1]["heard"] == "おはよう"
    assert rows[-1]["route"] == "local"


def test_呼び出し回数を数える(conn) -> None:
    for _ in range(3):
        db.record_claude_call(conn, driver="tmux", prompt_chars=10)
    assert db.count_claude_calls(conn, within_days=1) == 3
    assert db.count_claude_calls(conn, within_days=7) == 3


def test_操作の記録に判断理由が残る(conn) -> None:
    db.record_action(conn, tool="click", decision="denied", target_app="steam.exe", reason="未許可")
    row = conn.execute("SELECT * FROM action_log").fetchone()
    assert row["decision"] == "denied" and row["reason"] == "未許可"


def test_近い順に返る(conn) -> None:
    db.upsert_chunk(conn, kind="journal", text="コーヒー", embedding=[1.0, 0.0, 0.0, 0.0], ref="a")
    db.upsert_chunk(conn, kind="journal", text="ランニング", embedding=[0.0, 1.0, 0.0, 0.0], ref="b")
    hits = db.search_chunks(conn, [0.95, 0.05, 0.0, 0.0], top_k=2)
    assert hits[0]["text"] == "コーヒー"
    assert hits[0]["score"] > hits[1]["score"]


def test_同じ断片は二度入らない(conn) -> None:
    first = db.upsert_chunk(conn, kind="journal", text="同じ話", embedding=[1.0, 0, 0, 0], ref="a")
    again = db.upsert_chunk(conn, kind="journal", text="同じ話", embedding=[1.0, 0, 0, 0], ref="a")
    assert first == again
    assert conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0] == 1


def test_出典ごとに忘れられる(conn) -> None:
    db.upsert_chunk(conn, kind="journal", text="一", embedding=[1.0, 0, 0, 0], ref="a")
    db.upsert_chunk(conn, kind="journal", text="二", embedding=[0, 1.0, 0, 0], ref="a")
    db.upsert_chunk(conn, kind="fact", text="三", embedding=[0, 0, 1.0, 0], ref="b")
    assert db.forget_ref(conn, kind="journal", ref="a") == 2
    assert conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0] == 1


def test_種類で絞れる(conn) -> None:
    db.upsert_chunk(conn, kind="journal", text="日誌", embedding=[1.0, 0, 0, 0], ref="a")
    db.upsert_chunk(conn, kind="fact", text="事実", embedding=[1.0, 0, 0, 0], ref="b")
    hits = db.search_chunks(conn, [1.0, 0, 0, 0], top_k=5, kinds=["fact"])
    assert [h["text"] for h in hits] == ["事実"]


def test_長さの違うベクトルは最下位に落ちる() -> None:
    assert db.cosine([1.0, 0.0], [1.0, 0.0, 0.0]) == -1.0


def test_ゼロベクトルで割り算が壊れない() -> None:
    assert db.cosine([0.0, 0.0], [1.0, 0.0]) == -1.0


def test_埋め込みは往復しても崩れない() -> None:
    vec = [0.5, -0.25, 1.0, 0.0]
    assert db.unpack_embedding(db.pack_embedding(vec)) == pytest.approx(vec)
