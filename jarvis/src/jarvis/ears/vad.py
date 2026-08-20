"""発話の切れ目を見つける。

呼びかけの後、どこまでが一つの指示なのかを決める役。音そのものではなく
フレームごとの音量（RMS）だけを見るので、この判定は純粋な計算として
テストできる。周囲の雑音の大きさは部屋によって違うので、待機中の音を
使って床の高さを自分で決める。

より重い方式（Silero VAD など）に差し替えたくなったら、`is_speech` を
持つ別のクラスを `Endpointer` に渡せばよい。
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class State(Enum):
    WAITING = "waiting"      # まだ何も喋っていない
    SPEAKING = "speaking"    # 喋っている最中
    DONE = "done"            # 言い終わった
    TIMEOUT = "timeout"      # 長すぎるので打ち切った
    EMPTY = "empty"          # 呼びかけただけで何も言わなかった


class EnergyVad:
    """音量で声かどうかを見分ける。

    静かな部屋と、扇風機が回っている部屋とでは「無音」の音量が違う。
    待機中の音から床を推定し、その何倍かを超えたら声とみなす。
    """

    def __init__(
        self, *, ratio: float = 3.0, absolute_floor: float = 0.005,
        adapt: float = 0.05,
    ) -> None:
        self._ratio = ratio
        self._absolute_floor = absolute_floor
        self._adapt = adapt
        self._noise_floor: float | None = None

    @property
    def noise_floor(self) -> float:
        return self._noise_floor if self._noise_floor is not None else self._absolute_floor

    def observe_silence(self, rms: float) -> None:
        """待機中の音を床の推定に足す。"""
        if self._noise_floor is None:
            self._noise_floor = rms
        else:
            self._noise_floor = (1 - self._adapt) * self._noise_floor + self._adapt * rms

    def is_speech(self, rms: float) -> bool:
        threshold = max(self.noise_floor * self._ratio, self._absolute_floor)
        return rms > threshold


@dataclass
class Endpointer:
    """「言い終わった」を判定する。

    無音が続いたら終わり。ただし一度も喋っていないのに終わらせない。
    喋りだす前の間（考えている時間）は少し長めに待つ。
    """

    frame_ms: int
    silence_ms: int = 700
    max_utterance_ms: int = 30_000
    lead_in_ms: int = 3_000       # 呼びかけてから喋りだすまで待つ時間
    min_speech_ms: int = 200      # これ未満なら物音とみなす

    def __post_init__(self) -> None:
        self.state = State.WAITING
        self._elapsed_ms = 0
        self._speech_ms = 0
        self._trailing_silence_ms = 0

    @property
    def speech_ms(self) -> int:
        return self._speech_ms

    def feed(self, speech: bool) -> State:
        """1 フレーム分を食わせて、今の状態を返す。"""
        if self.state in (State.DONE, State.TIMEOUT, State.EMPTY):
            return self.state

        self._elapsed_ms += self.frame_ms

        if speech:
            self._speech_ms += self.frame_ms
            self._trailing_silence_ms = 0
            if self.state is State.WAITING and self._speech_ms >= self.min_speech_ms:
                self.state = State.SPEAKING
        else:
            self._trailing_silence_ms += self.frame_ms
            if self.state is State.SPEAKING and self._trailing_silence_ms >= self.silence_ms:
                self.state = State.DONE
                return self.state
            if self.state is State.WAITING and self._elapsed_ms >= self.lead_in_ms:
                # 呼びかけただけで何も言わなかった。黙って待機に戻る。
                self.state = State.EMPTY
                return self.state

        if self._elapsed_ms >= self.max_utterance_ms:
            self.state = State.TIMEOUT if self.state is State.SPEAKING else State.EMPTY
        return self.state

    @property
    def finished(self) -> bool:
        return self.state in (State.DONE, State.TIMEOUT, State.EMPTY)

    @property
    def captured_speech(self) -> bool:
        """録れた音を書き起こす価値があるか。"""
        return self.state in (State.DONE, State.TIMEOUT) and self._speech_ms >= self.min_speech_ms


def rms(samples) -> float:
    """int16 のフレームから -1.0〜1.0 換算の RMS を出す。"""
    import numpy as np

    if len(samples) == 0:
        return 0.0
    x = np.asarray(samples, dtype=np.float32) / 32768.0
    return float(np.sqrt(np.mean(x * x)))
