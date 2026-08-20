"""記憶の MCP サーバ。頭から記憶を引き、記憶に書き足すための窓口。

Windows 側で動かして HTTP で待つ。頭は WSL の中に居るので、SQLite の
ファイルを直接触らせるより、この口を1つ開けておくほうが確実で速い。
（WSL から /mnt/c 越しに SQLite を開くと、WAL の扱いが怪しくなる）

    claude mcp add --transport http memory http://127.0.0.1:8767/mcp
"""

from __future__ import annotations

from ..config import Config, get_config
from ..log import get_logger
from ..memory.recall import Memory

log = get_logger("記憶")


def create_server(config: Config, memory: Memory | None = None):
    from mcp.server.fastmcp import FastMCP

    store = memory or Memory(config)
    mcp = FastMCP(
        "jarvis-memory",
        host=config.memory.mcp_host,
        port=config.memory.mcp_port,
    )

    @mcp.tool()
    def recall(query: str) -> str:
        """今の話に関係のある過去を思い出す。会話を始める前に必ず一度呼ぶ。

        Args:
            query: これから話す内容。持ち主の発話をそのまま渡してよい。
        """
        recollection = store.recall(query)
        return recollection.as_prompt() or "関係のある記憶はありませんでした。"

    @mcp.tool()
    def remember(text: str, kind: str = "other", to_profile: bool = False) -> str:
        """次に活きる情報を覚える。会話の逐語録は入れないこと。

        Args:
            text: 覚える内容。「毎朝6時に起きる」のように、一文で言い切る。
            kind: preference（好み）/ constraint（制約）/ person（人）/
                  project（仕事）/ other のいずれか。
            to_profile: profile.md にも書き足すか。人物像に関わることだけ true。
        """
        return store.remember(text, kind=kind, to_profile=to_profile)

    @mcp.tool()
    def journal(text: str) -> str:
        """その日の出来事を日誌に書き足す。

        Args:
            text: 一行で書く。「家計簿アプリの土台を作った」など。
        """
        return store.journal(text)

    @mcp.tool()
    def read_profile() -> str:
        """持ち主の人物像・好み・制約を読む。迷ったらまずこれを読む。"""
        return store.vault.read_profile() or "profile.md はまだ空です。"

    @mcp.tool()
    def read_project(name: str) -> str:
        """進行中の仕事の状態を読む。続きから始めるために使う。

        Args:
            name: プロジェクト名。list_projects で得た名前を渡す。
        """
        return store.vault.read_project(name) or f"{name} の記録はまだありません。"

    @mcp.tool()
    def write_project(name: str, content: str) -> str:
        """進行中の仕事の状態を書き残す。次に呼ばれたとき続きから始められるように。

        Args:
            name: プロジェクト名。
            content: Markdown 全文。前の内容を置き換える。
        """
        path = store.vault.write_project(name, content)
        store.index_file(path)
        return f"{path.name} に書きました。"

    @mcp.tool()
    def list_projects() -> str:
        """進行中の仕事の一覧。"""
        names = store.vault.list_projects()
        return "、".join(names) if names else "進行中の仕事はありません。"

    @mcp.tool()
    def recent_journal(days: int = 3) -> str:
        """ここ数日の日誌を読む。

        Args:
            days: さかのぼる日数。
        """
        return store.vault.recent_journal(days) or "日誌はまだありません。"

    return mcp


def serve(config: Config | None = None) -> None:
    config = config or get_config()
    server = create_server(config)
    log.info(
        "記憶の窓口を開きます",
        url=f"http://{config.memory.mcp_host}:{config.memory.mcp_port}/mcp",
    )
    server.run(transport="streamable-http")


if __name__ == "__main__":
    serve()
