"""人が読める長期記憶。Markdown が正本。

SQLite は速く引くための索引で、消えても作り直せる。消えると困るものは
すべてここの Markdown にある。だから git で版を残し、非公開リポへ押し出す。

置き場所:
    profile.md         人物・好み・制約。頭が毎回まず読む
    projects/<名前>.md  進行中の仕事の状態
    journal/YYYY-MM-DD.md  その日の記録
"""

from __future__ import annotations

import re
import subprocess
from datetime import date, datetime
from pathlib import Path

from ..log import get_logger

log = get_logger("記憶")

PROFILE_TEMPLATE = """# わたしについて

ジャービスが毎回まず読むファイル。ここに書いたことは、次の会話にも効く。

## 基本

- 呼び方:
- 起きる時間 / 寝る時間:
- 仕事:

## 好み

## 避けたいこと

## 決めごと
"""

# ファイル名にしてよい文字だけを残す。頭が名前を決めるので、
# `../` のような細工が混ざる余地を残さない。
_SAFE_NAME = re.compile(r"[^0-9A-Za-zぁ-んァ-ヶ一-龠ー_-]+")


def safe_name(name: str) -> str:
    cleaned = _SAFE_NAME.sub("-", name).strip("-")
    return cleaned[:60] or "無題"


class Vault:
    def __init__(self, root: Path) -> None:
        self._root = root

    @property
    def root(self) -> Path:
        return self._root

    @property
    def profile(self) -> Path:
        return self._root / "profile.md"

    def project(self, name: str) -> Path:
        return self._root / "projects" / f"{safe_name(name)}.md"

    def journal(self, day: date | None = None) -> Path:
        day = day or date.today()
        return self._root / "journal" / f"{day.isoformat()}.md"

    # ---------------------------------------------------------------- 読み

    def ensure(self) -> None:
        (self._root / "projects").mkdir(parents=True, exist_ok=True)
        (self._root / "journal").mkdir(parents=True, exist_ok=True)
        if not self.profile.exists():
            self.profile.write_text(PROFILE_TEMPLATE, encoding="utf-8")

    def read_profile(self) -> str:
        return self.profile.read_text(encoding="utf-8") if self.profile.exists() else ""

    def read_project(self, name: str) -> str:
        path = self.project(name)
        return path.read_text(encoding="utf-8") if path.exists() else ""

    def list_projects(self) -> list[str]:
        directory = self._root / "projects"
        if not directory.is_dir():
            return []
        return sorted(p.stem for p in directory.glob("*.md"))

    def recent_journal(self, days: int = 3) -> str:
        directory = self._root / "journal"
        if not directory.is_dir():
            return ""
        files = sorted(directory.glob("*.md"))[-days:]
        return "\n\n".join(f.read_text(encoding="utf-8") for f in files)

    def profile_is_untouched(self) -> bool:
        """人物像がまだ雛形のままか。"""
        return self.profile.is_file() and self.read_profile() == PROFILE_TEMPLATE

    def markdown_files(self) -> list[Path]:
        """索引に取り込む Markdown を集める。

        隠しディレクトリの中身は記憶ではないので避ける。Obsidian を併用すると
        `.obsidian/plugins/<名前>/README.md` のような、プラグインに付いてくる
        説明書がこの下に増える。避けないと、それを持ち主の記憶として
        思い出してしまう。`.trash/`（Obsidian の削除箱）と `.git/` も同じ理由で
        外れる。

        まだ手が入っていない人物像も外す。雛形の説明文（「ここに書いたことは、
        次の会話にも効く」）は持ち主について何も語っていないのに、何を尋ねても
        それらしく引っかかる。1行でも書き足されたら、ふつうに取り込む。
        """
        untouched_profile = self.profile if self.profile_is_untouched() else None
        return sorted(
            p
            for p in self._root.rglob("*.md")
            if p.is_file()
            and p != untouched_profile
            and not any(part.startswith(".") for part in p.relative_to(self._root).parts)
        )

    # ---------------------------------------------------------------- 書き

    def append_journal(self, text: str, day: date | None = None) -> Path:
        self.ensure()
        path = self.journal(day)
        stamp = datetime.now().strftime("%H:%M")
        header = f"# {(day or date.today()).isoformat()}\n\n" if not path.exists() else ""
        with path.open("a", encoding="utf-8") as f:
            f.write(f"{header}- {stamp} {text.strip()}\n")
        return path

    def write_project(self, name: str, content: str) -> Path:
        self.ensure()
        path = self.project(name)
        path.write_text(content.rstrip() + "\n", encoding="utf-8")
        return path

    def append_profile(self, text: str) -> Path:
        self.ensure()
        with self.profile.open("a", encoding="utf-8") as f:
            f.write(f"\n- {text.strip()}\n")
        return self.profile


class VaultGit:
    """記憶を版で残し、非公開リポへ押し出す。

    公開リポには絶対に押し出さない。予定も会話も個人のものなので、
    行き先が公開されている場合はここで止める。
    """

    # 公開されていると分かっている行き先。ここへは押し出さない。
    KNOWN_PUBLIC = ("pomodoro-timer",)

    def __init__(self, root: Path) -> None:
        self._root = root

    def _git(self, *args: str, timeout: float = 30.0) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", "-C", str(self._root), *args],
            capture_output=True, text=True, timeout=timeout,
            encoding="utf-8", errors="replace",
        )

    @property
    def is_repo(self) -> bool:
        return (self._root / ".git").exists()

    def remote(self) -> str | None:
        if not self.is_repo:
            return None
        result = self._git("remote", "get-url", "origin")
        return result.stdout.strip() if result.returncode == 0 else None

    def remote_is_public(self) -> bool:
        url = self.remote() or ""
        return any(marker in url for marker in self.KNOWN_PUBLIC)

    def has_changes(self) -> bool:
        if not self.is_repo:
            return False
        return bool(self._git("status", "--porcelain").stdout.strip())

    def commit(self, message: str | None = None) -> bool:
        """変わっていれば1つのコミットにまとめる。変わっていなければ何もしない。"""
        if not self.is_repo or not self.has_changes():
            return False
        message = message or f"記憶を更新する（{datetime.now():%Y-%m-%d %H:%M}）"
        self._git("add", "-A")
        result = self._git("commit", "-m", message)
        if result.returncode != 0:
            log.warning("記憶をコミットできませんでした", error=result.stderr.strip())
            return False
        log.info("記憶をコミットしました")
        return True

    def push(self) -> bool:
        if not self.is_repo or self.remote() is None:
            return False
        if self.remote_is_public():
            log.error(
                "記憶の押し出しを止めました。行き先が公開リポジトリです",
                remote=self.remote(),
                対処="非公開リポジトリに変えてください",
            )
            return False
        result = self._git("push", timeout=120)
        if result.returncode != 0:
            log.warning("記憶を押し出せませんでした", error=result.stderr.strip())
            return False
        return True

    def sync(self, message: str | None = None) -> bool:
        return self.commit(message) and self.push()
