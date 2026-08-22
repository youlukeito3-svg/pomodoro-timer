"""環境診断。

「動くかどうか」より先に「課金の経路がないか」を見る。ここで止められれば、
うっかり従量課金が走ることは原理的に起こらない。

- fatal … これがあると起動しない
- warn  … その機能だけ使えない
- ok    … 問題なし
"""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .config import Config, get_config

Level = Literal["ok", "warn", "fatal"]

# これらが環境にあると、サブスクリプションではなく API 課金の経路が開いてしまう。
BILLING_ENV_VARS = (
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BEDROCK_BASE_URL",
    "ANTHROPIC_VERTEX_BASE_URL",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
)


@dataclass(frozen=True)
class Check:
    name: str
    level: Level
    detail: str
    hint: str | None = None


def check_billing_paths(env: dict[str, str] | None = None) -> list[Check]:
    """従量課金につながる環境変数が無いことを確かめる。ここが最重要。"""
    env = os.environ if env is None else env
    found = [v for v in BILLING_ENV_VARS if env.get(v)]
    if found:
        return [
            Check(
                "課金経路", "fatal",
                f"従量課金につながる環境変数があります: {', '.join(found)}",
                "この変数を消してから起動してください。"
                "サブスクリプションだけで動かす約束なので、あるうちは起動しません。",
            )
        ]
    return [
        Check(
            "課金経路", "ok",
            "API キーの類は環境にありません（サブスクリプションのみで動きます）",
        )
    ]


def _run(cmd: list[str], timeout: float = 10.0) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout + p.stderr).strip()
    except FileNotFoundError:
        return 127, f"{cmd[0]} が見つかりません"
    except subprocess.TimeoutExpired:
        return 124, "応答がありません"
    except OSError as e:
        return 1, str(e)


def check_paths(cfg: Config) -> list[Check]:
    out: list[Check] = []
    try:
        cfg.ensure_dirs()
        out.append(Check("保存先", "ok", f"{cfg.paths.data} に書けます"))
    except OSError as e:
        out.append(Check("保存先", "fatal", f"{cfg.paths.data} を作れません: {e}"))
        return out

    git_dir = cfg.paths.data / ".git"
    if not git_dir.exists():
        out.append(
            Check(
                "記憶のバックアップ", "warn", f"{cfg.paths.data} は git リポジトリではありません",
                "README の「記憶を非公開リポにする」の手順を実行してください。",
            )
        )
    else:
        code, remote = _run(["git", "-C", str(cfg.paths.data), "remote", "get-url", "origin"])
        if code != 0:
            out.append(Check("記憶のバックアップ", "warn", "origin がありません"))
        elif "pomodoro-timer" in remote:
            out.append(
                Check(
                    "記憶のバックアップ", "fatal",
                    f"記憶の保存先が公開リポジトリを指しています: {remote}",
                    "個人の予定や会話が公開されます。非公開リポに変えてください。",
                )
            )
        else:
            out.append(Check("記憶のバックアップ", "ok", remote))
    return out


def check_allowlist(cfg: Config) -> list[Check]:
    from .safety.guard import Policy

    if not cfg.allowlist_path.is_file():
        return [Check("許可リスト", "fatal", f"{cfg.allowlist_path} がありません")]
    try:
        policy = Policy.load(cfg.allowlist_path)
    except Exception as e:  # noqa: BLE001 - 設定の壊れ方は色々ある
        return [Check("許可リスト", "fatal", f"読めません: {e}")]
    if not policy.allow:
        return [Check("許可リスト", "warn", "許可アプリが空です。PC の操作は一切できません")]
    return [
        Check(
            "許可リスト", "ok",
            f"許可 {len(policy.allow)} 件 / 禁止 {len(policy.deny)} 件 / "
            f"確認 {len(policy.ui_text) + len(policy.typing) + len(policy.shell)} 件",
        )
    ]


def check_wsl_distro(cfg: Config) -> list[Check]:
    """wsl_prefix が指すディストロが実在するかを確かめる。

    `claude --version` や `tmux -V` が失敗しても、原因が「ディストロ名を
    間違えている」なのか「その中に何かが入っていない」なのかは区別がつかない。
    ここで先にディストロの実在だけを確かめておけば、あとの失敗は中身の問題だと
    分かる。
    """
    prefix = list(cfg.brain.wsl_prefix)
    if not prefix or "wsl" not in prefix[0].lower():
        return []
    distro = prefix[prefix.index("-d") + 1] if "-d" in prefix else None
    if distro is None:
        return []
    code, out = _run(["wsl.exe", "-l", "-q"], timeout=10)
    if code != 0:
        return [
            Check(
                "WSL", "fatal", "wsl.exe -l -q が実行できません",
                "WSL2 が入っているか確かめてください。",
            )
        ]
    names = {
        line.strip() for line in out.replace("\x00", "").splitlines() if line.strip()
    }
    if distro not in names:
        return [
            Check(
                "WSL ディストロ", "fatal",
                f"'{distro}' という名前のディストロが見つかりません"
                f"（インストール済み: {', '.join(sorted(names)) or 'なし'}）",
                "`wsl -l -q` で実際の名前を確認し、jarvis.toml の "
                "[brain] wsl_prefix をその名前に合わせてください。",
            )
        ]
    return [Check("WSL ディストロ", "ok", f"'{distro}' が見つかりました")]


def check_brain(cfg: Config) -> list[Check]:
    out: list[Check] = []
    prefix = list(cfg.brain.wsl_prefix)

    out += check_wsl_distro(cfg)
    if blocking_failures(out):
        # ディストロが無いのに claude --version 等を叩いても、
        # 分かりにくい失敗が増えるだけなのでここで打ち切る。
        return out

    code, ver = _run(prefix + [cfg.brain.claude_bin, "--version"], timeout=30)
    if code != 0:
        out.append(
            Check(
                "頭（Claude Code）", "fatal", f"起動できません: {ver}",
                "WSL の中で `claude --version` が通るか、`wsl_prefix` の設定が合っているか確認してください。",
            )
        )
    else:
        out.append(Check("頭（Claude Code）", "ok", ver.splitlines()[0] if ver else "起動できます"))

    if cfg.brain.driver == "tmux":
        code, detail = _run(prefix + ["tmux", "-V"], timeout=20)
        if code != 0:
            # 前置きコマンド（wsl.exe）自体が無い場合と、その中に tmux が
            # 無い場合とでは直し方が違う。取り違えると遠回りになる。
            hint = (
                "WSL で `sudo apt install tmux` を実行してください。"
                if prefix and code != 127
                else "jarvis.toml の wsl_prefix が正しいか確かめてください。"
            )
            out.append(Check("tmux", "fatal", detail or "tmux がありません", hint))
        else:
            code, _ = _run(prefix + ["tmux", "has-session", "-t", cfg.brain.tmux_session], timeout=20)
            state = "常駐しています" if code == 0 else "まだ立っていません（起動時に作ります）"
            out.append(Check("tmux セッション", "ok", f"{cfg.brain.tmux_session}: {state}"))
    elif cfg.brain.driver == "headless":
        out.append(
            Check(
                "頭の駆動方式", "warn",
                "headless（claude -p）です",
                "Anthropic は将来この経路を別枠課金に移す方針を示しています。"
                "課金を避けたいなら driver = \"tmux\" のままにしてください。",
            )
        )
    else:
        out.append(Check("頭の駆動方式", "fatal", f"未知の driver: {cfg.brain.driver}"))
    return out


def _http_ok(url: str, timeout: float = 3.0) -> tuple[bool, str]:
    try:
        import httpx

        r = httpx.get(url, timeout=timeout)
        return r.status_code < 500, f"HTTP {r.status_code}"
    except Exception as e:  # noqa: BLE001 - 落ちている理由は問わない
        return False, str(e).splitlines()[0]


def check_router(cfg: Config) -> list[Check]:
    ok, detail = _http_ok(f"{cfg.brain.router.ollama_url}/api/tags")
    if not ok:
        return [
            Check(
                "振り分け（Ollama）", "warn", f"つながりません: {detail}",
                "Ollama が止まっていると、定型の用事まで Claude に回ります。"
                "`ollama serve` を起動してください。",
            )
        ]
    try:
        import httpx

        tags = httpx.get(f"{cfg.brain.router.ollama_url}/api/tags", timeout=5).json()
        names = {m["name"].split(":")[0] for m in tags.get("models", [])}
    except Exception:  # noqa: BLE001
        names = set()
    missing = [
        m for m in (cfg.brain.router.model, cfg.memory.embed_model)
        if m.split(":")[0] not in names
    ]
    if missing:
        return [
            Check(
                "振り分け（Ollama）", "warn", f"モデルが未取得: {', '.join(missing)}",
                "`ollama pull " + "` と `ollama pull ".join(missing) + "` を実行してください。",
            )
        ]
    return [Check("振り分け（Ollama）", "ok", f"{cfg.brain.router.model} と {cfg.memory.embed_model} が使えます")]


def check_mouth(cfg: Config) -> list[Check]:
    ok, detail = _http_ok(f"{cfg.mouth.engine_url}/speakers")
    if not ok:
        return [
            Check(
                "口（音声合成）", "warn", f"つながりません: {detail}",
                "AivisSpeech Engine を起動してください（VOICEVOX でも同じ API です）。",
            )
        ]
    return [Check("口（音声合成）", "ok", cfg.mouth.engine_url)]


def check_ears(cfg: Config) -> list[Check]:
    out: list[Check] = []
    missing = [
        name for name in ("sounddevice", "openwakeword", "faster_whisper")
        if not _importable(name)
    ]
    if missing:
        out.append(
            Check(
                "耳", "warn", f"未導入: {', '.join(missing)}",
                'pip install -e ".[ears]" を実行してください。',
            )
        )
        return out

    out.append(Check("耳", "ok", "ウェイクワードと聞き取りの部品が揃っています"))
    if cfg.ears.stt.device == "cuda":
        code, info = _run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"])
        if code != 0:
            out.append(
                Check(
                    "GPU", "warn", "nvidia-smi が使えません",
                    'GPU が無い環境なら jarvis.toml の [ears.stt] を '
                    'device = "cpu", compute_type = "int8" にしてください。',
                )
            )
        else:
            out.append(Check("GPU", "ok", info.splitlines()[0]))
    return out


def check_memory(cfg: Config) -> list[Check]:
    if not _importable("sqlite_vec"):
        return [
            Check(
                "記憶の検索", "warn", "sqlite-vec が入っていません（総当たりで検索します）",
                '記憶が増えて遅くなったら pip install -e ".[memory]" を実行してください。',
            )
        ]
    return [Check("記憶の検索", "ok", "sqlite-vec が使えます")]


def check_google(cfg: Config) -> list[Check]:
    if not _importable("googleapiclient"):
        return [
            Check(
                "予定（Google）", "warn", "google-api-python-client が入っていません",
                'pip install -e ".[google]" を実行してください。',
            )
        ]
    credentials = cfg.paths.data / cfg.google.credentials_file
    token = cfg.paths.data / cfg.google.token_file
    if not credentials.exists():
        return [
            Check(
                "予定（Google）", "warn", f"{credentials} がありません",
                "README の「Google と繋ぐ」の手順で用意してください。",
            )
        ]
    if not token.exists():
        return [
            Check(
                "予定（Google）", "warn", "まだ許可を取っていません",
                "`python -m jarvis brief` を一度実行すると、ブラウザで許可を求めます。",
            )
        ]
    from .brain.scheduler import parse_hhmm

    if cfg.google.morning_brief_at and parse_hhmm(cfg.google.morning_brief_at) is None:
        return [
            Check(
                "予定（Google）", "warn",
                f"朝の読み上げの時刻が読めません: {cfg.google.morning_brief_at}",
                '"07:00" の形で書いてください。',
            )
        ]
    return [Check("予定（Google）", "ok", f"繋がっています（朝の読み上げ {cfg.google.morning_brief_at or 'なし'}）")]


def check_hands(cfg: Config) -> list[Check]:
    if os.name != "nt":
        return [Check("手（PC 操作）", "warn", "Windows 以外なので PC 操作は無効です")]
    missing = [n for n in ("pyautogui", "pygetwindow") if not _importable(n)]
    if missing:
        return [
            Check(
                "手（PC 操作）", "warn", f"未導入: {', '.join(missing)}",
                'pip install -e ".[hands]" を実行してください。',
            )
        ]
    return [Check("手（PC 操作）", "ok", "マウス・キーボードを操作できます")]


def _importable(name: str) -> bool:
    import importlib.util

    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def run_all(cfg: Config | None = None) -> list[Check]:
    cfg = cfg or get_config()
    checks: list[Check] = []
    checks += check_billing_paths()
    checks += check_paths(cfg)
    checks += check_allowlist(cfg)
    checks += check_brain(cfg)
    checks += check_router(cfg)
    checks += check_mouth(cfg)
    checks += check_ears(cfg)
    checks += check_memory(cfg)
    checks += check_google(cfg)
    checks += check_hands(cfg)
    return checks


_MARK = {"ok": "✓", "warn": "▲", "fatal": "✗"}


def format_report(checks: list[Check]) -> str:
    width = max((len(c.name) for c in checks), default=0)
    lines = []
    for c in checks:
        lines.append(f"{_MARK[c.level]} {c.name.ljust(width)}  {c.detail}")
        if c.hint and c.level != "ok":
            lines.append(f"  {' ' * width}  → {c.hint}")
    fatal = sum(1 for c in checks if c.level == "fatal")
    warn = sum(1 for c in checks if c.level == "warn")
    lines.append("")
    if fatal:
        lines.append(f"起動できません。直すべき点が {fatal} 件あります（注意 {warn} 件）。")
    elif warn:
        lines.append(f"起動できます。使えない機能が {warn} 件あります。")
    else:
        lines.append("すべて問題ありません。")
    return "\n".join(lines)


def blocking_failures(checks: list[Check]) -> list[Check]:
    return [c for c in checks if c.level == "fatal"]
