"""一往復の流れ。どの入口から来ても同じ道を通ることを見る。

振り分け（Ollama）はここでは意図的に不通にしてある。使えないときは
すべて頭に回る、というのが設計どおりの挙動で、それも一緒に確かめられる。

不通を「入れていないから」に頼らないこと。開発機に Ollama を入れた途端、
発話の分類がその場の気分で変わり、頭に渡るはずのものが雑談で片づいて
落ちる。試すたびに結果が変わるテストは、無いよりたちが悪い。
"""

import pytest

from jarvis.brain.claude_driver import Answer, ClaudeDriver, ClaudeUnavailable
from jarvis.brain.pipeline import Pipeline
from jarvis.config import load_config
from jarvis.memory import db


class FakeDriver(ClaudeDriver):
    """頭のふり。渡された指示を覚えて、決めた返事をする。"""

    def __init__(self, config, reply="<speak>やっておきました。</speak>", fail=False):
        super().__init__(config)
        self.prompts: list[str] = []
        self._reply = reply
        self._fail = fail
        self.started = False

    def ask(self, prompt: str) -> Answer:
        self.prompts.append(prompt)
        if self._fail:
            raise ClaudeUnavailable("繋がりません")
        return Answer(self._reply)

    def start(self) -> None:
        self.started = True


@pytest.fixture()
def config(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_CONFIG", "")
    cfg = load_config()
    cfg.paths.data_dir = str(tmp_path)
    # 振り分けを確実に不通にする。9 番は discard で、何も待ち受けていない。
    cfg.brain.router.ollama_url = "http://127.0.0.1:9"
    cfg.brain.router.timeout_sec = 1.0
    cfg.ensure_dirs()
    return cfg


def build(config, **kw):
    spoken: list[str] = []
    driver = kw.pop("driver", None) or FakeDriver(config)
    conn = db.connect(config.paths.db, embed_dim=config.memory.embed_dim)
    pipeline = Pipeline(config, speak=spoken.append, driver=driver, conn=conn)
    return pipeline, driver, conn, spoken


def test_時刻は頭を使わずに答える(config) -> None:
    pipeline, driver, _, _ = build(config)
    reply = pipeline.handle("今何時？")
    assert reply.route == "local"
    assert not reply.used_claude
    assert driver.prompts == []
    assert "時" in reply.text


def test_本当の用事は頭に回る(config) -> None:
    pipeline, driver, _, _ = build(config)
    reply = pipeline.handle("明日の会議の資料を作って")
    assert reply.used_claude
    assert driver.prompts == ["明日の会議の資料を作って"]


def test_やりとりは記録に残る(config) -> None:
    pipeline, _, conn, _ = build(config)
    pipeline.handle("今何時？")
    rows = db.recent_conversations(conn)
    assert rows[-1]["heard"] == "今何時？"
    assert rows[-1]["route"] == "local"


def test_上限に達したら頭を呼ばずに断る(config) -> None:
    config.brain.budget.max_calls_per_day = 1
    pipeline, driver, _, _ = build(config)
    pipeline.handle("ひとつめの用事")
    reply = pipeline.handle("ふたつめの用事")
    assert reply.route == "refused"
    assert len(driver.prompts) == 1
    assert reply.text == config.brain.budget.refusal_message


def test_頭に繋がらなくても落ちない(config) -> None:
    pipeline, _, _, _ = build(config, driver=FakeDriver(config, fail=True))
    reply = pipeline.handle("何かして")
    assert reply.route == "error"
    assert "繋がりません" in reply.text or "繋がり" in reply.text


def test_空の発話は何もしない(config) -> None:
    pipeline, driver, conn, _ = build(config)
    assert pipeline.handle("   ").route == "empty"
    assert driver.prompts == []
    assert db.recent_conversations(conn) == []


def test_タイマーは声で知らせる(config) -> None:
    pipeline, _, _, spoken = build(config)
    reply = pipeline.handle("1秒タイマー")
    assert "タイマー" in reply.text
    pipeline._timers[0].join(3)
    assert spoken == ["お時間です。"]
    pipeline.close()


def test_ストップは読み上げを止める(config) -> None:
    pipeline, _, _, _ = build(config)
    stopped = []
    pipeline.on_stop = lambda: stopped.append(True)
    pipeline.handle("ストップ")
    assert stopped == [True]


def test_確認待ちが無いのに返事をされたら聞き返す(config) -> None:
    pipeline, driver, _, _ = build(config)
    reply = pipeline.handle("はい")
    assert reply.route == "local"
    assert "何に対する" in reply.text
    assert driver.prompts == []


def test_確認待ちがあれば返事が届く(config) -> None:
    pipeline, _, _, _ = build(config)
    answered: list[bool] = []

    def handler(agreed: bool) -> str:
        answered.append(agreed)
        return "送信しました。"

    pipeline.confirm_handler = handler
    assert pipeline.handle("はい").text == "送信しました。"
    assert answered == [True]


def test_断ればその旨を返す(config) -> None:
    pipeline, _, _, _ = build(config)
    pipeline.confirm_handler = lambda agreed: "取りやめました。"
    assert pipeline.handle("いいえ").text == "取りやめました。"


def test_遅れて届いた返事を拾える(config) -> None:
    from jarvis.brain.outbox import Outbox

    class LateDriver(FakeDriver):
        def __init__(self, cfg):
            super().__init__(cfg)
            self.box = Outbox(cfg.paths.data / "outbox")

        def pending_replies(self, older_than_sec: float = 1.0):
            return list(self.box.drain(older_than_sec=0.0))

    pipeline, driver, _, _ = build(config, driver=LateDriver(config))
    driver.box.put("<speak>終わりました。</speak>")
    assert pipeline.collect_late_replies() == ["<speak>終わりました。</speak>"]


def test_遅れた返事の口を持たない駆動でも落ちない(config) -> None:
    pipeline, _, _, _ = build(config)
    assert pipeline.collect_late_replies() == []


# ------------------------------------------------------------ 記憶の差し込み


def test_思い出したことを先に頭へ渡す(config) -> None:
    """頭に MCP で引かせると往復が1つ増える。よく使う分は先に渡す。"""
    from jarvis.memory.recall import Memory

    memory = Memory(config)
    memory.remember("コーヒーはブラック", kind="preference")

    driver = FakeDriver(config)
    conn = db.connect(config.paths.db, embed_dim=config.memory.embed_dim)
    pipeline = Pipeline(config, speak=lambda _t: None, driver=driver, conn=conn, memory=memory)

    pipeline.handle("何か飲み物を用意して")
    assert "コーヒーはブラック" in driver.prompts[0]
    assert driver.prompts[0].endswith("何か飲み物を用意して")


def test_思い出すものが無ければ指示だけを渡す(config) -> None:
    """空の枠を付けて渡すと、その分だけサブスク枠を無駄に食う。"""
    from jarvis.memory.recall import Memory

    driver = FakeDriver(config)
    conn = db.connect(config.paths.db, embed_dim=config.memory.embed_dim)
    pipeline = Pipeline(
        config, speak=lambda _t: None, driver=driver, conn=conn, memory=Memory(config)
    )
    pipeline.handle("何かして")
    assert driver.prompts == ["何かして"]


def test_思い出せなくても用事は進む(config) -> None:
    class BrokenMemory:
        def recall(self, _query):
            raise RuntimeError("記憶が壊れています")

    driver = FakeDriver(config)
    conn = db.connect(config.paths.db, embed_dim=config.memory.embed_dim)
    pipeline = Pipeline(
        config, speak=lambda _t: None, driver=driver, conn=conn, memory=BrokenMemory()
    )
    assert pipeline.handle("何かして").used_claude
    assert driver.prompts == ["何かして"]
