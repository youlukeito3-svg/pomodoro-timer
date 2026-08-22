"""人が読める長期記憶。消えると困るものがここに残ることを確かめる。"""

import subprocess
from datetime import date

import pytest

from jarvis.memory.vault import Vault, VaultGit, safe_name


@pytest.fixture()
def vault(tmp_path) -> Vault:
    v = Vault(tmp_path / "memory")
    v.ensure()
    return v


def test_初回に人物像の雛形ができる(vault: Vault) -> None:
    assert vault.profile.exists()
    assert "わたしについて" in vault.read_profile()


def test_雛形は上書きしない(vault: Vault) -> None:
    vault.profile.write_text("# 書き換えた", encoding="utf-8")
    vault.ensure()
    assert vault.read_profile() == "# 書き換えた"


def test_日誌は追記される(vault: Vault) -> None:
    vault.append_journal("朝の散歩をした")
    vault.append_journal("家計簿アプリを作り始めた")
    text = vault.journal().read_text(encoding="utf-8")
    assert "朝の散歩をした" in text and "家計簿アプリ" in text
    assert text.startswith(f"# {date.today().isoformat()}")


def test_仕事の状態は置き換わる(vault: Vault) -> None:
    vault.write_project("家計簿", "# 家計簿\n\n下ごしらえ中")
    vault.write_project("家計簿", "# 家計簿\n\n画面ができた")
    assert "画面ができた" in vault.read_project("家計簿")
    assert "下ごしらえ" not in vault.read_project("家計簿")


def test_進行中の一覧が読める(vault: Vault) -> None:
    vault.write_project("家計簿", "x")
    vault.write_project("旅行計画", "y")
    assert vault.list_projects() == ["家計簿", "旅行計画"]


@pytest.mark.parametrize(
    ("given", "expected"),
    [("../../etc/passwd", "etc-passwd"), ("家計簿 2026", "家計簿-2026"),
     ("///", "無題"), ("", "無題")],
)
def test_名前に細工が混ざっても外へ出ない(given: str, expected: str) -> None:
    """名前は頭が決める。ディレクトリの外に書き出させない。"""
    assert safe_name(given) == expected


# ------------------------------------------------------------ 索引の対象


def test_下の階層のノートも索引の対象になる(vault: Vault) -> None:
    """Obsidian で好きにフォルダを切っても、記憶として拾われる。"""
    (vault.root / "料理").mkdir()
    (vault.root / "料理" / "カレー.md").write_text("# カレー", encoding="utf-8")
    assert any(p.name == "カレー.md" for p in vault.markdown_files())


def test_Obsidianの設定は記憶に混ざらない(vault: Vault) -> None:
    """プラグインの README を持ち主の記憶として思い出さないこと。"""
    plugin = vault.root / ".obsidian" / "plugins" / "dataview"
    plugin.mkdir(parents=True)
    (plugin / "README.md").write_text("# Dataview\n\nA plugin.", encoding="utf-8")
    assert all(".obsidian" not in p.parts for p in vault.markdown_files())


def test_消したノートは索引の対象から外れる(vault: Vault) -> None:
    """Obsidian の削除箱に入れたものを、まだあるかのように思い出さない。"""
    trash = vault.root / ".trash"
    trash.mkdir()
    (trash / "捨てた.md").write_text("# もう要らない", encoding="utf-8")
    assert all("捨てた.md" != p.name for p in vault.markdown_files())


def test_ここ数日の日誌をまとめて読める(vault: Vault) -> None:
    vault.append_journal("きのうのこと", day=date(2026, 8, 19))
    vault.append_journal("きょうのこと", day=date(2026, 8, 20))
    text = vault.recent_journal(days=3)
    assert "きのうのこと" in text and "きょうのこと" in text


# ------------------------------------------------------------ 版として残す


def git_repo(root, remote: str | None = None) -> VaultGit:
    root.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "config", "user.email", "j@example.com"], cwd=root, check=True)
    subprocess.run(["git", "config", "user.name", "jarvis"], cwd=root, check=True)
    if remote:
        subprocess.run(["git", "remote", "add", "origin", remote], cwd=root, check=True)
    return VaultGit(root)


def test_リポジトリでなければ何もしない(tmp_path) -> None:
    git = VaultGit(tmp_path)
    assert not git.is_repo
    assert not git.commit()


def test_変わっていればコミットする(tmp_path) -> None:
    git = git_repo(tmp_path / "data")
    (tmp_path / "data" / "memo.md").write_text("覚えた", encoding="utf-8")
    assert git.commit()
    assert not git.has_changes()


def test_変わっていなければコミットしない(tmp_path) -> None:
    git = git_repo(tmp_path / "data")
    (tmp_path / "data" / "memo.md").write_text("覚えた", encoding="utf-8")
    git.commit()
    assert not git.commit()


def test_公開リポには押し出さない(tmp_path) -> None:
    """個人の予定と会話が公開される事故は、一度起きたら取り消せない。"""
    git = git_repo(tmp_path / "data", remote="https://github.com/someone/pomodoro-timer.git")
    (tmp_path / "data" / "memo.md").write_text("秘密", encoding="utf-8")
    assert git.remote_is_public()
    assert not git.push()
    assert not git.sync()


def test_非公開の行き先なら止めない(tmp_path) -> None:
    git = git_repo(tmp_path / "data", remote="git@github.com:me/jarvis-data.git")
    assert not git.remote_is_public()
