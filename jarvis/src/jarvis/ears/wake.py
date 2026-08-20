"""ウェイクワード。「ジャービス」と呼ばれたことに気づく役。

openWakeWord の学習済みモデル `hey_jarvis` を使う。完全にローカルで動き、
アカウントも鍵も要らない。常時マイクを聞いているのはこの部分だけで、
呼ばれるまでは音声認識にも Claude にも一切渡らない。
"""

from __future__ import annotations

from ..log import get_logger

log = get_logger("耳")

# openWakeWord が一度に食べるサンプル数。16kHz なので 80ms ちょうど。
FRAME_SAMPLES = 1280
FRAME_MS = 80


class WakeWord:
    def __init__(self, model_name: str = "hey_jarvis_v0.1", threshold: float = 0.5) -> None:
        self._threshold = threshold
        self._model_name = model_name
        self._model = None

    def _ensure_model(self):
        if self._model is not None:
            return self._model
        from openwakeword.model import Model
        from openwakeword.utils import download_models

        # 初回だけモデルを取りに行く。以降はローカルのものを使う。
        try:
            download_models(model_names=[self._model_name])
        except Exception as e:  # noqa: BLE001 - 既に手元にあれば失敗してよい
            log.debug("モデルの取得を飛ばしました", error=str(e))

        self._model = Model(wakeword_models=[self._model_name], inference_framework="onnx")
        log.info("ウェイクワードを読み込みました", model=self._model_name, threshold=self._threshold)
        return self._model

    def score(self, frame) -> float:
        """1 フレーム分を食わせて、呼ばれている度合いを返す。"""
        model = self._ensure_model()
        predictions = model.predict(frame)
        return max(predictions.values()) if predictions else 0.0

    def heard(self, frame) -> bool:
        return self.score(frame) >= self._threshold

    def reset(self) -> None:
        """一度反応したら履歴を捨てる。同じ声で二重に反応しないように。"""
        if self._model is not None:
            self._model.reset()
