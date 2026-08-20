"""発話の切れ目。ここが甘いと、言い終わる前に切られたり延々と録り続けたりする。"""

from jarvis.ears.vad import EnergyVad, Endpointer, State

FRAME = 80


def feed(endpointer: Endpointer, pattern: str) -> State:
    """'s' を発話、'.' を無音として食わせる。"""
    state = endpointer.state
    for ch in pattern:
        state = endpointer.feed(ch == "s")
    return state


def test_喋って黙れば終わる() -> None:
    e = Endpointer(frame_ms=FRAME, silence_ms=400)
    assert feed(e, "s" * 10 + "." * 5) is State.DONE
    assert e.captured_speech


def test_途中の短い間では切らない() -> None:
    """言葉に詰まっただけで切られると、言い直しになる。"""
    e = Endpointer(frame_ms=FRAME, silence_ms=700)
    assert feed(e, "s" * 5 + "." * 5 + "s" * 5) is State.SPEAKING


def test_呼んだだけで何も言わなければ待機に戻る() -> None:
    e = Endpointer(frame_ms=FRAME, silence_ms=400, lead_in_ms=800)
    assert feed(e, "." * 15) is State.EMPTY
    assert not e.captured_speech


def test_物音は発話とみなさない() -> None:
    e = Endpointer(frame_ms=FRAME, silence_ms=400, lead_in_ms=800, min_speech_ms=200)
    assert feed(e, "s." * 1 + "." * 20) is State.EMPTY


def test_長すぎたら打ち切るが録れた分は使う() -> None:
    e = Endpointer(frame_ms=FRAME, silence_ms=5000, max_utterance_ms=800)
    assert feed(e, "s" * 20) is State.TIMEOUT
    assert e.captured_speech


def test_終わったあとは状態が変わらない() -> None:
    e = Endpointer(frame_ms=FRAME, silence_ms=400)
    feed(e, "s" * 10 + "." * 5)
    assert feed(e, "s" * 10) is State.DONE


def test_騒がしい部屋では床が上がる() -> None:
    quiet, noisy = EnergyVad(), EnergyVad()
    for _ in range(50):
        quiet.observe_silence(0.001)
        noisy.observe_silence(0.02)
    assert noisy.noise_floor > quiet.noise_floor
    # 静かな部屋では声とみなす音量が、騒がしい部屋では雑音に埋もれる。
    assert quiet.is_speech(0.03)
    assert not noisy.is_speech(0.03)


def test_絶対的な下限を割る音は声としない() -> None:
    """無音の部屋で床が 0 近くまで下がっても、ごく小さな音を拾わない。"""
    vad = EnergyVad(absolute_floor=0.005)
    for _ in range(50):
        vad.observe_silence(0.0)
    assert not vad.is_speech(0.004)
    assert vad.is_speech(0.006)
