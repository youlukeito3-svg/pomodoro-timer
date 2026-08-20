"""耳の全体。呼びかけを待ち、言い終わるまで録り、テキストにして渡す。

マイクは常に開いているが、ウェイクワードに反応するまでは 80ms ごとの
音量とウェイクワードの点数しか見ていない。呼ばれてはじめて録音が始まり、
言い終わったところで書き起こす。
"""

from __future__ import annotations

import queue
import threading
from typing import Iterator

from ..config import EarsConfig
from ..log import get_logger
from .stt import Transcriber
from .vad import EnergyVad, Endpointer, State, rms
from .wake import FRAME_MS, FRAME_SAMPLES, WakeWord

log = get_logger("耳")


class Listener:
    def __init__(self, config: EarsConfig, transcriber: Transcriber | None = None) -> None:
        self._config = config
        self._wake = WakeWord(config.wake_model, config.wake_threshold)
        # 聞き取りモデルは重い。外出先からの音声メモとも1つを分け合う。
        self._stt = transcriber or Transcriber(config.stt)
        self._frames: queue.Queue = queue.Queue(maxsize=200)
        self._stop = threading.Event()
        # 呼びかけに気づいた瞬間に鳴らす合図。これが無いと、
        # 聞いてもらえているのか分からないまま喋ることになる。
        self._on_wake: list = []

    def on_wake(self, callback) -> None:
        self._on_wake.append(callback)

    def stop(self) -> None:
        self._stop.set()

    def warmup(self) -> None:
        self._stt.warmup()

    # -------------------------------------------------------------- 本体

    def listen_forever(self) -> Iterator[str]:
        """呼びかけられるたびに、聞き取ったテキストを1件ずつ返す。"""
        import numpy as np
        import sounddevice as sd

        def callback(indata, _frames, _time, status) -> None:
            if status:
                log.debug("入力の取りこぼし", status=str(status))
            try:
                self._frames.put_nowait(indata[:, 0].copy())
            except queue.Full:
                pass  # 詰まったら古い音を捨てる。遅れて届く指示に意味はない。

        vad = EnergyVad()
        stream = sd.InputStream(
            samplerate=self._config.sample_rate, blocksize=FRAME_SAMPLES,
            channels=1, dtype="int16", device=self._config.input_device,
            callback=callback,
        )
        with stream:
            log.info("待機しています", wake=self._config.wake_model)
            while not self._stop.is_set():
                frame = self._next_frame()
                if frame is None:
                    continue

                level = rms(frame)
                if not self._wake.heard(frame):
                    vad.observe_silence(level)
                    continue

                log.info("呼ばれました")
                self._wake.reset()
                for cb in self._on_wake:
                    cb()

                captured = self._record_utterance(vad)
                if captured is None:
                    continue
                text = self._stt.transcribe(np.concatenate(captured))
                if text:
                    yield text

    def _record_utterance(self, vad: EnergyVad):
        """言い終わるまで録る。何も言われなければ None を返す。"""
        endpointer = Endpointer(
            frame_ms=FRAME_MS,
            silence_ms=self._config.silence_ms,
            max_utterance_ms=int(self._config.max_utterance_sec * 1000),
        )
        captured: list = []
        while not endpointer.finished and not self._stop.is_set():
            frame = self._next_frame()
            if frame is None:
                continue
            captured.append(frame)
            state = endpointer.feed(vad.is_speech(rms(frame)))
            if state is State.TIMEOUT:
                log.info("長すぎるので打ち切りました")

        if not endpointer.captured_speech:
            log.info("何も言われなかったので待機に戻ります")
            return None
        return captured

    def _next_frame(self):
        try:
            return self._frames.get(timeout=0.5)
        except queue.Empty:
            return None
