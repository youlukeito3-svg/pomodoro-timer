"""Stop フック。頭の返事が確実に口へ渡ることを見る。

フックは WSL 側で動き、jarvis を import しない。だからここでも
モジュールとしてではなく、外から実行して確かめる。
"""

import json
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "hooks" / "stop_speak.py"


def write_transcript(path: Path, messages: list[tuple[str, str]]) -> Path:
    lines = []
    for role, text in messages:
        if role == "assistant":
            lines.append(json.dumps({"type": "assistant",
                                     "message": {"content": [{"type": "text", "text": text}]}}))
        else:
            lines.append(json.dumps({"type": "user", "message": {"content": text}}))
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def run_hook(event: dict, outbox: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(HOOK)], input=json.dumps(event), text=True,
        capture_output=True, env={"JARVIS_OUTBOX": str(outbox), "PATH": "/usr/bin:/bin"},
    )


def delivered(outbox: Path) -> list[str]:
    return [json.loads(p.read_text(encoding="utf-8"))["text"] for p in sorted(outbox.glob("*.json"))]


def test_最後の返事を届ける(tmp_path) -> None:
    transcript = write_transcript(tmp_path / "t.jsonl", [
        ("user", "予定は"),
        ("assistant", "<speak>調べます。</speak>"),
        ("assistant", "<speak>3件あります。</speak>\n\n詳細は表のとおり"),
    ])
    outbox = tmp_path / "outbox"
    assert run_hook({"transcript_path": str(transcript)}, outbox).returncode == 0
    assert delivered(outbox) == ["3件あります。"]


def test_speak_が無ければ全文を渡す(tmp_path) -> None:
    """約束が破られても黙らない。読み上げる部分は受け取る側で選ぶ。"""
    transcript = write_transcript(tmp_path / "t.jsonl", [("assistant", "できました。")])
    outbox = tmp_path / "outbox"
    run_hook({"transcript_path": str(transcript)}, outbox)
    assert delivered(outbox) == ["できました。"]


def test_フックの連鎖を止める(tmp_path) -> None:
    transcript = write_transcript(tmp_path / "t.jsonl", [("assistant", "はい")])
    outbox = tmp_path / "outbox"
    run_hook({"transcript_path": str(transcript), "stop_hook_active": True}, outbox)
    assert delivered(outbox) == []


def test_返事が無ければ何も置かない(tmp_path) -> None:
    transcript = write_transcript(tmp_path / "t.jsonl", [("user", "やあ")])
    outbox = tmp_path / "outbox"
    run_hook({"transcript_path": str(transcript)}, outbox)
    assert delivered(outbox) == []


def test_記録が無くても落ちない(tmp_path) -> None:
    """フックが失敗して Claude Code の作業まで止まる、ということが起きてはいけない。"""
    result = run_hook({"transcript_path": str(tmp_path / "ない.jsonl")}, tmp_path / "outbox")
    assert result.returncode == 0


def test_壊れた行は飛ばして読む(tmp_path) -> None:
    transcript = tmp_path / "t.jsonl"
    transcript.write_text(
        "{壊れている\n"
        + json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "無事です。"}]}}),
        encoding="utf-8",
    )
    outbox = tmp_path / "outbox"
    run_hook({"transcript_path": str(transcript)}, outbox)
    assert delivered(outbox) == ["無事です。"]


def test_全文も一緒に運ばれる(tmp_path) -> None:
    transcript = write_transcript(tmp_path / "t.jsonl", [("assistant", "<speak>要点。</speak>\n\n詳細")])
    outbox = tmp_path / "outbox"
    run_hook({"transcript_path": str(transcript), "session_id": "s1"}, outbox)
    payload = json.loads(next((outbox).glob("*.json")).read_text(encoding="utf-8"))
    assert payload["session_id"] == "s1"
    assert "詳細" in payload["full"]
