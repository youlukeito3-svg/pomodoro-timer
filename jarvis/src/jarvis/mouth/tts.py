"""口。AivisSpeech / VOICEVOX に喋らせる。

両者は同じ HTTP API を話すので、設定の URL と話者 ID を差し替えるだけで
声を入れ替えられる。合成と再生を1文ずつ噛み合わせてあるので、
長い返事でも先頭から喋りだす。
"""

from __future__ import annotations

import io
import threading
import wave

import httpx

from ..config import MouthConfig
from ..log import get_logger
from .speech_text import split_for_speech, truncate_for_speech

log = get_logger("口")


class VoiceEngineError(RuntimeError):
    pass


class Voice:
    def __init__(self, config: MouthConfig, client: httpx.Client | None = None) -> None:
        self._config = config
        self._client = client or httpx.Client(base_url=config.engine_url, timeout=30.0)
        # 喋っている最中に次の依頼が来たら、順番に並べる。重ねて鳴らさない。
        self._lock = threading.Lock()
        self._stop = threading.Event()

    # -------------------------------------------------------------- 合成

    def synthesize(self, text: str) -> bytes:
        """1文を WAV にする。"""
        query = self._client.post(
            "/audio_query", params={"text": text, "speaker": self._config.speaker_id}
        )
        if query.status_code != 200:
            raise VoiceEngineError(f"audio_query が {query.status_code} を返しました")
        payload = query.json()
        payload["speedScale"] = self._config.speed
        wav = self._client.post(
            "/synthesis", params={"speaker": self._config.speaker_id}, json=payload
        )
        if wav.status_code != 200:
            raise VoiceEngineError(f"synthesis が {wav.status_code} を返しました")
        return wav.content

    # -------------------------------------------------------------- 再生

    def say(self, text: str, *, truncate: bool = True) -> str:
        """声に出す。実際に読み上げた文字列を返す。"""
        spoken = truncate_for_speech(text, self._config.max_speak_chars) if truncate else text
        chunks = split_for_speech(spoken)
        if not chunks:
            return ""
        with self._lock:
            self._stop.clear()
            for chunk in chunks:
                if self._stop.is_set():
                    log.info("読み上げを中断しました")
                    break
                try:
                    self._play(self.synthesize(chunk))
                except (httpx.HTTPError, VoiceEngineError, OSError) as e:
                    # 喋れないことでシステム全体を止めない。画面には残る。
                    log.error("読み上げに失敗しました", error=str(e), text=chunk)
                    print(f"[ジャービス] {spoken}")
                    break
        return spoken

    def stop(self) -> None:
        """喋っている途中で黙らせる。「ストップ」の一声で効く。"""
        self._stop.set()
        try:
            import sounddevice as sd

            sd.stop()
        except ImportError:
            pass

    def _play(self, wav_bytes: bytes) -> None:
        try:
            import numpy as np
            import sounddevice as sd
        except ImportError:
            # 音が出せない環境では画面に出す。開発中はこれで足りる。
            print(f"[ジャービス（音声なし）] {len(wav_bytes)} バイトの音声")
            return

        with wave.open(io.BytesIO(wav_bytes), "rb") as w:
            frames = w.readframes(w.getnframes())
            channels, rate = w.getnchannels(), w.getframerate()
            width = w.getsampwidth()

        dtype = {1: np.int8, 2: np.int16, 4: np.int32}.get(width)
        if dtype is None:
            raise VoiceEngineError(f"扱えない量子化ビット数です: {width * 8}")
        data = np.frombuffer(frames, dtype=dtype)
        if channels > 1:
            data = data.reshape(-1, channels)
        sd.play(data, rate)
        sd.wait()

    def close(self) -> None:
        self._client.close()
