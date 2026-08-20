"""Windows 側の受け口。

頭（Claude Code）は WSL の中に居て、口と耳は Windows 側に居る。その境目を
跨ぐのがこのサーバの役目で、口が2つある。

- `/reply` … Stop フックが応答を投げ込む。待っている駆動側がこれを拾う。
- `/speak` … 今すぐ読み上げてほしいときに使う。

WSL2 をミラーモードにしておけば、WSL からこの localhost がそのまま通る。
おかげでフック側は Windows のパスを一切知らなくて済む。
"""

from __future__ import annotations

from typing import Any

from ..brain.outbox import Outbox
from ..config import Config
from ..log import get_logger
from .speech_text import extract_speech
from .tts import Voice

log = get_logger("口")


def create_app(config: Config, voice: Voice | None = None, outbox: Outbox | None = None) -> Any:
    from fastapi import FastAPI
    from pydantic import BaseModel

    speaker = voice or Voice(config.mouth)
    box = outbox or Outbox(config.paths.data / "outbox")
    app = FastAPI(title="jarvis-windows-side")

    class SpeakRequest(BaseModel):
        text: str
        # 応答まるごとを渡してよい。読み上げる部分はこちらで取り出す。
        raw: bool = False

    class ReplyRequest(BaseModel):
        text: str
        session_id: str = ""
        full: str = ""

    @app.post("/reply")
    def reply(req: ReplyRequest) -> dict:
        """頭からの返事を受け取る。ここでは読み上げない。

        読み上げるかどうかは、待っている側が決める。ここで喋ってしまうと、
        `jarvis ask` のように声を使いたくない場面でも音が出てしまう。
        """
        path = box.put(req.text, session_id=req.session_id, full=req.full)
        log.info("返事を受け取りました", chars=len(req.text), path=path.name)
        return {"accepted": True}

    @app.post("/speak")
    def speak(req: SpeakRequest) -> dict:
        text = req.text if req.raw else extract_speech(req.text)
        if not text:
            return {"spoken": "", "reason": "読み上げる内容がありませんでした"}
        log.info("読み上げます", chars=len(text))
        return {"spoken": speaker.say(text)}

    @app.post("/stop")
    def stop() -> dict:
        speaker.stop()
        return {"stopped": True}

    @app.get("/health")
    def health() -> dict:
        return {"ok": True}

    return app


def serve(config: Config, voice: Voice | None = None) -> None:
    import uvicorn

    uvicorn.run(
        create_app(config, voice),
        host=config.mouth.listen_host,
        port=config.mouth.listen_port,
        log_level="warning",
    )
