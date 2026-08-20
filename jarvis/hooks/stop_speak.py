#!/usr/bin/env python3
"""Claude Code の Stop フック。応答をジャービスの口へ渡す。

このスクリプトは WSL 側（Claude Code と同じ場所）で動く。ジャービス本体は
Windows 側に居るので、ここでは jarvis パッケージを import しない。
標準ライブラリだけで書いてあるのはそのため。

渡し方は2つあり、上から順に試す。

1. JARVIS_REPLY_URL … Windows 側の受け口へ HTTP で渡す（既定・推奨）
   WSL2 のミラーモードなら localhost がそのまま通るので、パスの対応を
   知らなくて済む。
2. JARVIS_OUTBOX … WSL から見えるディレクトリに JSON を置く
   （/mnt/c/... など。HTTP が使えないときの逃げ道）

どちらも設定されていなければ、何もせず黙って終わる。フックが失敗しても
Claude Code の作業は止めない。声が出ないだけで、画面には残っている。
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SPEAK_BLOCK = re.compile(r"<speak>(.*?)</speak>", re.DOTALL | re.IGNORECASE)


def last_assistant_text(transcript_path: str) -> str:
    """会話の記録から、最後にアシスタントが書いた文を取り出す。"""
    path = Path(transcript_path)
    if not path.is_file():
        return ""
    latest = ""
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("type") != "assistant":
                continue
            content = (entry.get("message") or {}).get("content")
            if isinstance(content, str):
                text = content
            elif isinstance(content, list):
                text = "".join(
                    part.get("text", "")
                    for part in content
                    if isinstance(part, dict) and part.get("type") == "text"
                )
            else:
                continue
            if text.strip():
                latest = text
    return latest


def deliver(text: str, meta: dict) -> bool:
    url = os.environ.get("JARVIS_REPLY_URL")
    if url:
        payload = json.dumps({"text": text, **meta}).encode("utf-8")
        request = urllib.request.Request(
            url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(request, timeout=5):
                return True
        except (urllib.error.URLError, OSError) as e:
            print(f"[jarvis] 受け口に届きません: {e}", file=sys.stderr)

    outbox = os.environ.get("JARVIS_OUTBOX")
    if outbox:
        directory = Path(outbox)
        try:
            directory.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
            target = directory / f"{stamp}.json"
            tmp = target.with_suffix(".json.part")
            tmp.write_text(
                json.dumps({"text": text, "ts": datetime.now(timezone.utc).isoformat(), **meta},
                           ensure_ascii=False),
                encoding="utf-8",
            )
            tmp.replace(target)
            return True
        except OSError as e:
            print(f"[jarvis] 返事を書き出せません: {e}", file=sys.stderr)
    return False


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    # フックが自分の応答でまた呼ばれる連鎖を避ける。
    if event.get("stop_hook_active"):
        return 0

    text = last_assistant_text(event.get("transcript_path", ""))
    if not text.strip():
        return 0

    # 読み上げる部分がはっきり書かれていれば、そこだけを渡す。
    match = SPEAK_BLOCK.search(text)
    spoken = match.group(1).strip() if match else text

    deliver(spoken, {"session_id": event.get("session_id", ""), "full": text})
    return 0


if __name__ == "__main__":
    sys.exit(main())
