"""外出先からの指示。

スマホの Discord から話しかけると、自宅の PC のジャービスが動いて結果を返す。
文字でも、音声メモでもよい。

入口は違っても、通る道は目の前で話しかけたときと同じ pipeline。挙動が入口
ごとに変わると、覚えることが増えて使わなくなる。

トークンは設定ファイルに書かず、環境変数 JARVIS_DISCORD_TOKEN に置く。
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from ..brain.pipeline import Pipeline
from ..config import Config
from ..log import get_logger
from ..mouth.speech_text import extract_speech

log = get_logger("外出先")

# Discord の1通あたりの上限。超える分は切って、続きは残らない旨を添える。
MESSAGE_LIMIT = 1900


def should_handle(message, *, owner_user_id: int, channel_ids: list[int], me) -> bool:
    """この発言に応えてよいか。

    持ち主以外の指示で自宅の PC が動く、ということが起きてはいけない。
    ここが唯一の関門なので、判定は素直な形にして目で追えるようにしてある。
    """
    if message.author.id == getattr(me, "id", None):
        return False                      # 自分の発言に反応しない
    if owner_user_id and message.author.id != owner_user_id:
        return False                      # 持ち主以外は相手にしない
    if not message.content and not message.attachments:
        return False
    is_dm = getattr(message.channel, "guild", None) is None
    if is_dm:
        return True
    return message.channel.id in channel_ids


def chunk_message(text: str, limit: int = MESSAGE_LIMIT) -> list[str]:
    """長い返事を Discord が受け取れる長さに割る。行の途中では割らない。"""
    if not text:
        return []
    chunks: list[str] = []
    current = ""
    for line in text.splitlines(keepends=True):
        while len(line) > limit:
            if current:
                chunks.append(current)
                current = ""
            chunks.append(line[:limit])
            line = line[limit:]
        if len(current) + len(line) > limit:
            chunks.append(current)
            current = line
        else:
            current += line
    if current:
        chunks.append(current)
    return chunks


class DiscordBridge:
    def __init__(self, config: Config, pipeline: Pipeline, transcriber=None) -> None:
        self._config = config
        self._pipeline = pipeline
        self._transcriber = transcriber

    def build_client(self):
        import discord

        intents = discord.Intents.default()
        intents.message_content = True
        client = discord.Client(intents=intents)
        bridge = self

        @client.event
        async def on_ready() -> None:
            log.info("外出先からの受付を始めました", 名前=str(client.user))

        @client.event
        async def on_message(message) -> None:
            if not should_handle(
                message,
                owner_user_id=bridge._config.remote.owner_user_id,
                channel_ids=bridge._config.remote.channel_ids,
                me=client.user,
            ):
                return
            async with message.channel.typing():
                reply = await bridge._respond(message)
            for chunk in chunk_message(reply):
                await message.channel.send(chunk)

        return client

    async def _respond(self, message) -> str:
        import asyncio

        heard = message.content.strip()
        if not heard and message.attachments:
            heard = await self._transcribe_attachment(message.attachments[0])
        if not heard:
            return "聞き取れませんでした。"

        # pipeline は同期で、頭の返事を待つ間ずっと塞がる。
        # 別スレッドに逃がして、その間もほかの発言を受けられるようにする。
        reply = await asyncio.to_thread(self._pipeline.handle, heard, source="discord")
        return extract_speech(reply.text) or reply.text or "（返事がありませんでした）"

    async def _transcribe_attachment(self, attachment) -> str:
        if self._transcriber is None:
            return ""
        suffix = Path(attachment.filename).suffix or ".ogg"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            path = Path(f.name)
        try:
            await attachment.save(path)
            import asyncio

            return await asyncio.to_thread(self._transcriber.transcribe_file, path)
        except Exception as e:  # noqa: BLE001 - 届く音声の形は色々ある
            log.warning("音声メモを聞き取れませんでした", error=str(e))
            return ""
        finally:
            path.unlink(missing_ok=True)

    def run(self) -> None:
        token = self._config.remote.token
        if not token:
            log.warning(
                "外出先からの受付を始められません",
                対処="環境変数 JARVIS_DISCORD_TOKEN にトークンを入れてください",
            )
            return
        self.build_client().run(token, log_handler=None)
