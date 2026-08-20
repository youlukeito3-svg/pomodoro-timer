"""聞き取り。録れた音を日本語のテキストにする。

faster-whisper（CTranslate2）を使う。GPU があれば large-v3-turbo が
実用的な速さで動く。ここもローカル完結で、音声が外に出ることはない。
"""

from __future__ import annotations

import time

from ..config import SttConfig
from ..log import get_logger

log = get_logger("耳")

# 書き起こしが空振りしたときに出がちな相槌。指示として扱わない。
_NOISE = {"", "ご視聴ありがとうございました", "ありがとうございました", "おわり", "。", "…"}


class Transcriber:
    def __init__(self, config: SttConfig) -> None:
        self._config = config
        self._model = None

    def _ensure_model(self):
        if self._model is not None:
            return self._model
        from faster_whisper import WhisperModel

        started = time.monotonic()
        self._model = WhisperModel(
            self._config.model,
            device=self._config.device,
            compute_type=self._config.compute_type,
        )
        log.info(
            "聞き取りモデルを読み込みました",
            model=self._config.model, device=self._config.device,
            sec=round(time.monotonic() - started, 1),
        )
        return self._model

    def warmup(self) -> None:
        """最初の呼びかけで待たされないよう、先に読み込んでおく。"""
        self._ensure_model()

    def transcribe(self, audio) -> str:
        """int16 のサンプル列を受け取り、書き起こしを返す。"""
        import numpy as np

        model = self._ensure_model()
        samples = np.asarray(audio, dtype=np.float32) / 32768.0
        started = time.monotonic()
        segments, _info = model.transcribe(
            samples,
            language=self._config.language,
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        text = "".join(s.text for s in segments).strip()
        log.info(
            "聞き取りました",
            text=text, sec=round(time.monotonic() - started, 2),
            audio_sec=round(len(samples) / 16000, 1),
        )
        return "" if text in _NOISE else text
