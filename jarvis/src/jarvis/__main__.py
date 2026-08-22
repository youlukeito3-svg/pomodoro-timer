"""ジャービスの入口。

    python -m jarvis            通しで起動する（耳・口・頭・手）
    python -m jarvis doctor     環境を診断する
    python -m jarvis devices    マイクとスピーカーの一覧を出す
    python -m jarvis say TEXT   読み上げてみる
    python -m jarvis ask TEXT   頭に投げて応答を見る（声を使わない）
    python -m jarvis test-ears  聞き取りだけ動かす
    python -m jarvis warmup     聞き取りモデルを実際に読み込み、CUDA の可否を見る
    python -m jarvis budget     Claude を今日何回呼んだかを見る
    python -m jarvis recall Q   記憶から思い出せるものを見る
    python -m jarvis reindex    Markdown の記憶を索引に入れ直す
    python -m jarvis sync       記憶を非公開リポへ保存する
    python -m jarvis serve-memory  記憶の MCP サーバだけを動かす
    python -m jarvis serve-hands   手の MCP サーバだけを動かす
    python -m jarvis serve-google  予定の MCP サーバだけを動かす
    python -m jarvis brief         毎朝の読み上げを今すぐ試す
    python -m jarvis panic      すべての操作を止める
    python -m jarvis resume     止めた操作を再開できるようにする

各コマンドは必要なものだけを import する。耳の部品が入っていない環境でも
doctor は動く、という状態を保つため。
"""

from __future__ import annotations

import argparse
import sys

from .config import get_config
from .log import get_logger, setup_logging


def _boot(*, require_clean: bool = True):
    """設定を読み、ログを立て、課金経路がないことを確かめる。"""
    cfg = get_config()
    cfg.ensure_dirs()
    setup_logging(cfg.paths.logs)

    from .doctor import blocking_failures, check_billing_paths, format_report

    failures = blocking_failures(check_billing_paths())
    if failures and require_clean:
        print(format_report(failures), file=sys.stderr)
        raise SystemExit(2)
    return cfg


# ---------------------------------------------------------------- 各コマンド

def cmd_doctor(_args: argparse.Namespace) -> int:
    from .doctor import blocking_failures, format_report, run_all

    cfg = _boot(require_clean=False)
    checks = run_all(cfg)
    print(format_report(checks))
    return 1 if blocking_failures(checks) else 0


def cmd_devices(_args: argparse.Namespace) -> int:
    try:
        import sounddevice as sd
    except ImportError:
        print('耳の部品が入っていません。pip install -e ".[ears]" を実行してください。')
        return 1
    print(sd.query_devices())
    return 0


def cmd_say(args: argparse.Namespace) -> int:
    from .mouth.tts import Voice

    cfg = _boot()
    Voice(cfg.mouth).say(args.text)
    return 0


def cmd_ask(args: argparse.Namespace) -> int:
    from .brain.pipeline import Pipeline

    cfg = _boot()
    pipeline = Pipeline(cfg)
    reply = pipeline.handle(args.text, source="cli")
    print(reply.text)
    return 0


def cmd_test_ears(_args: argparse.Namespace) -> int:
    from .ears.listener import Listener

    cfg = _boot()
    log = get_logger("耳")
    listener = Listener(cfg.ears)
    log.info("「ジャービス」と呼びかけてください。Ctrl+C で終了します。")
    try:
        for heard in listener.listen_forever():
            print(f"→ {heard}")
    except KeyboardInterrupt:
        pass
    return 0


def cmd_warmup(_args: argparse.Namespace) -> int:
    """聞き取りモデルを実際に読み込ませる。

    `nvidia-smi` が通っても、faster-whisper が要る cuBLAS / cuDNN の DLL が
    足りないと、モデルを読み込んだ瞬間に初めて落ちる。doctor はここまで
    見ていないので、「doctor は緑なのに喋りかけると落ちる」を防ぐために
    実際に1回読み込ませる。
    """
    from .ears.stt import Transcriber

    cfg = _boot(require_clean=False)
    log = get_logger("耳")
    log.info(
        "聞き取りモデルを読み込みます",
        model=cfg.ears.stt.model, device=cfg.ears.stt.device,
    )
    try:
        Transcriber(cfg.ears.stt).warmup()
    except ImportError:
        print('耳の部品が入っていません。pip install -e ".[ears]" を実行してください。')
        return 1
    except Exception as e:  # noqa: BLE001 - 落ち方は CUDA まわりだけとは限らない
        print(f"聞き取りモデルを読み込めませんでした: {e}")
        if cfg.ears.stt.device == "cuda":
            print(
                "device = \"cuda\" での読み込みに失敗しています。"
                "cuBLAS / cuDNN の DLL が入っているか確かめるか、"
                "難しければ config/jarvis.toml の [ears.stt] を "
                'device = "cpu", compute_type = "int8" に変えてください。'
            )
        return 1
    print(f"聞き取りモデル（{cfg.ears.stt.model}, {cfg.ears.stt.device}）を読み込めました。")
    return 0


def _memory():
    from .memory.recall import Memory

    cfg = _boot(require_clean=False)
    return cfg, Memory(cfg)


def cmd_recall(args: argparse.Namespace) -> int:
    _cfg, memory = _memory()
    print(memory.recall(args.query).as_prompt() or "関係のある記憶はありませんでした。")
    return 0


def cmd_reindex(_args: argparse.Namespace) -> int:
    _cfg, memory = _memory()
    print(f"{memory.reindex()} 個の断片を索引に入れました。")
    return 0


def cmd_sync(_args: argparse.Namespace) -> int:
    _cfg, memory = _memory()
    if memory.git.remote_is_public():
        print("行き先が公開リポジトリなので保存しません。非公開リポに変えてください。")
        return 1
    if memory.sync():
        print("記憶を保存しました。")
        return 0
    print("保存するものはありませんでした。")
    return 0


def cmd_serve_memory(_args: argparse.Namespace) -> int:
    from .mcp.memory_server import serve

    serve(_boot())
    return 0


def cmd_serve_hands(_args: argparse.Namespace) -> int:
    from .mcp.hands_server import serve

    serve(_boot())
    return 0


def cmd_serve_google(_args: argparse.Namespace) -> int:
    from .mcp.google_server import serve

    serve(_boot())
    return 0


def cmd_brief(_args: argparse.Namespace) -> int:
    from .brain.briefing import compose
    from .mcp.google_server import GoogleDesk

    cfg = _boot()
    text = compose(cfg, GoogleDesk(cfg))
    print(text)
    from .mouth.tts import Voice

    Voice(cfg.mouth).say(text, truncate=False)
    return 0


def cmd_budget(_args: argparse.Namespace) -> int:
    from .brain.budget import Budget
    from .memory import db

    cfg = _boot(require_clean=False)
    conn = db.connect(cfg.paths.db, embed_dim=cfg.memory.embed_dim)
    status = Budget(conn, cfg.brain.budget).status()
    print(status.describe())
    print(f"残り 今日 {status.remaining_today} 回 / 今週 {status.remaining_this_week} 回")
    return 0


def cmd_panic(_args: argparse.Namespace) -> int:
    from .safety.panic import PanicSwitch

    cfg = _boot(require_clean=False)
    PanicSwitch(cfg.paths.data).engage("コマンドから停止")
    print("すべての操作を止めました。`python -m jarvis resume` で戻ります。")
    return 0


def cmd_resume(_args: argparse.Namespace) -> int:
    from .safety.panic import PanicSwitch

    cfg = _boot(require_clean=False)
    PanicSwitch(cfg.paths.data).release()
    print("操作を再開できるようにしました。")
    return 0


def cmd_run(_args: argparse.Namespace) -> int:
    from .supervisor import Supervisor

    cfg = _boot()
    return Supervisor(cfg).run()


# ---------------------------------------------------------------- 引数

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="jarvis", description="声で動くフルアシスタント")
    sub = p.add_subparsers(dest="command")

    sub.add_parser("doctor", help="環境を診断する").set_defaults(func=cmd_doctor)
    sub.add_parser("devices", help="マイクとスピーカーの一覧").set_defaults(func=cmd_devices)
    sub.add_parser("budget", help="Claude の呼び出し回数").set_defaults(func=cmd_budget)
    sub.add_parser("panic", help="すべての操作を止める").set_defaults(func=cmd_panic)
    sub.add_parser("resume", help="操作を再開できるようにする").set_defaults(func=cmd_resume)
    sub.add_parser("test-ears", help="聞き取りだけ動かす").set_defaults(func=cmd_test_ears)
    sub.add_parser("warmup", help="聞き取りモデルを読み込み、CUDA の可否を見る").set_defaults(func=cmd_warmup)
    sub.add_parser("reindex", help="記憶を索引に入れ直す").set_defaults(func=cmd_reindex)
    sub.add_parser("sync", help="記憶を非公開リポへ保存する").set_defaults(func=cmd_sync)
    sub.add_parser("serve-memory", help="記憶の MCP サーバ").set_defaults(func=cmd_serve_memory)
    sub.add_parser("serve-hands", help="手の MCP サーバ").set_defaults(func=cmd_serve_hands)
    sub.add_parser("serve-google", help="予定の MCP サーバ").set_defaults(func=cmd_serve_google)
    sub.add_parser("brief", help="毎朝の読み上げを試す").set_defaults(func=cmd_brief)
    sub.add_parser("run", help="通しで起動する").set_defaults(func=cmd_run)

    say = sub.add_parser("say", help="読み上げてみる")
    say.add_argument("text")
    say.set_defaults(func=cmd_say)

    recall = sub.add_parser("recall", help="記憶から思い出せるものを見る")
    recall.add_argument("query")
    recall.set_defaults(func=cmd_recall)

    ask = sub.add_parser("ask", help="頭に投げて応答を見る")
    ask.add_argument("text")
    ask.set_defaults(func=cmd_ask)

    return p


def _use_utf8_output() -> None:
    """出力を UTF-8 にする。

    日本語 Windows のコンソールは既定が cp932 で、doctor の `✓` や `▲` を
    そのまま書くと UnicodeEncodeError で落ちる。診断を見ようとして落ちるのは
    いちばん困る失敗なので、入口で直しておく。`errors="replace"` にしてあるので、
    どうしても表せない文字があっても落ちずに済む。
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError, ValueError):
            pass  # 差し替えられた stream には reconfigure が無いことがある


def main(argv: list[str] | None = None) -> int:
    _use_utf8_output()
    parser = build_parser()
    args = parser.parse_args(argv)
    func = getattr(args, "func", cmd_run)
    return func(args)


if __name__ == "__main__":
    raise SystemExit(main())
