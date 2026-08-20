"""設定の読み込み。

`config/jarvis.toml` を読んで型を付けるだけ。秘密は環境変数から取る。
環境変数 `JARVIS_CONFIG` があればそのファイルを優先する。
"""

from __future__ import annotations

import os
import tomllib
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

PACKAGE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = PACKAGE_ROOT.parent.parent
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "jarvis.toml"
DEFAULT_ALLOWLIST = PROJECT_ROOT / "config" / "allowlist.yaml"


def expand(path: str) -> Path:
    """`~` と環境変数を展開した絶対パスにする。"""
    return Path(os.path.expandvars(os.path.expanduser(path))).resolve()


class Paths(BaseModel):
    data_dir: str = "~/jarvis-data"
    workspace: str = "~/jarvis-workspace"

    @property
    def data(self) -> Path:
        return expand(self.data_dir)

    @property
    def db(self) -> Path:
        return self.data / "db" / "jarvis.db"

    @property
    def vault(self) -> Path:
        return self.data / "memory"

    @property
    def logs(self) -> Path:
        return self.data / "logs"

    @property
    def screenshots(self) -> Path:
        return self.data / "screenshots"


class SttConfig(BaseModel):
    model: str = "large-v3-turbo"
    device: str = "cuda"
    compute_type: str = "float16"
    language: str = "ja"


class EarsConfig(BaseModel):
    wake_model: str = "hey_jarvis_v0.1"
    wake_threshold: float = 0.5
    input_device: int | str | None = None
    sample_rate: int = 16000
    silence_ms: int = 700
    max_utterance_sec: float = 30.0
    stt: SttConfig = Field(default_factory=SttConfig)


class MouthConfig(BaseModel):
    engine_url: str = "http://127.0.0.1:10101"
    speaker_id: int = 888753760
    speed: float = 1.1
    listen_host: str = "127.0.0.1"
    listen_port: int = 8766
    max_speak_chars: int = 300


class RouterConfig(BaseModel):
    ollama_url: str = "http://127.0.0.1:11434"
    model: str = "qwen3:4b"
    timeout_sec: float = 8.0
    fallback_to_claude: bool = True


class BudgetConfig(BaseModel):
    max_calls_per_day: int = 120
    max_calls_per_week: int = 500
    refusal_message: str = "今日はもう頭を使い切りました。明日また声をかけてください。"


class BrainConfig(BaseModel):
    driver: str = "tmux"
    tmux_session: str = "jarvis"
    claude_bin: str = "claude"
    wsl_prefix: list[str] = Field(default_factory=list)
    response_timeout_sec: int = 300
    router: RouterConfig = Field(default_factory=RouterConfig)
    budget: BudgetConfig = Field(default_factory=BudgetConfig)


class MemoryConfig(BaseModel):
    embed_model: str = "bge-m3"
    embed_dim: int = 1024
    top_k: int = 8
    autocommit_minutes: int = 30


class HandsConfig(BaseModel):
    listen_host: str = "127.0.0.1"
    listen_port: int = 8765
    screenshot_on_action: bool = True
    confirm_ttl_sec: int = 60
    panic_hotkey: str = "ctrl+alt+shift+j"


class RemoteConfig(BaseModel):
    enabled: bool = False
    channel_ids: list[int] = Field(default_factory=list)
    owner_user_id: int = 0

    @property
    def token(self) -> str | None:
        return os.environ.get("JARVIS_DISCORD_TOKEN")


class Config(BaseModel):
    paths: Paths = Field(default_factory=Paths)
    ears: EarsConfig = Field(default_factory=EarsConfig)
    mouth: MouthConfig = Field(default_factory=MouthConfig)
    brain: BrainConfig = Field(default_factory=BrainConfig)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    hands: HandsConfig = Field(default_factory=HandsConfig)
    remote: RemoteConfig = Field(default_factory=RemoteConfig)

    allowlist_path: Path = DEFAULT_ALLOWLIST

    def ensure_dirs(self) -> None:
        for d in (
            self.paths.data,
            self.paths.db.parent,
            self.paths.vault,
            self.paths.vault / "projects",
            self.paths.vault / "journal",
            self.paths.logs,
            self.paths.screenshots,
        ):
            d.mkdir(parents=True, exist_ok=True)


def load_config(path: Path | str | None = None) -> Config:
    """設定ファイルを読む。無ければ既定値だけで動く。"""
    candidate = path or os.environ.get("JARVIS_CONFIG") or DEFAULT_CONFIG
    candidate = Path(candidate)
    data: dict = {}
    if candidate.is_file():
        data = tomllib.loads(candidate.read_text(encoding="utf-8"))
    return Config.model_validate(data)


@lru_cache(maxsize=1)
def get_config() -> Config:
    return load_config()
