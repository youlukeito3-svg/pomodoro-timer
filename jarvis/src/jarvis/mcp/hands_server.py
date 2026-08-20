"""手の MCP サーバ。頭から PC を触るための窓口。

Windows 側で動かして HTTP で待つ。マウスもキーボードも Windows のものなので、
ここだけは WSL の中に置けない。

    claude mcp add --transport http hands http://127.0.0.1:8765/mcp

道具の説明文は頭が読む。何ができて何が断られるかを、ここではっきり書いておく。
断られたときに頭が同じことを繰り返さないためには、理由が伝わることが要る。
"""

from __future__ import annotations

from ..config import Config, get_config
from ..log import get_logger
from .hands import Hands

log = get_logger("手")


def create_server(config: Config, hands: Hands | None = None):
    from mcp.server.fastmcp import FastMCP

    if hands is None:
        from .windows import create_desktop

        hands = Hands(config, desktop=create_desktop())

    mcp = FastMCP(
        "jarvis-hands",
        host=config.hands.listen_host,
        port=config.hands.listen_port,
    )

    @mcp.tool()
    def screenshot() -> str:
        """今の画面を撮って保存する。何かを操作する前に必ず一度見ること。

        返ってきたパスを Read で開けば、画面の中身を目で確かめられる。
        """
        return hands.screenshot()

    @mcp.tool()
    def active_window() -> str:
        """前面にあるアプリとウィンドウの名前。操作が通るかはこれで決まる。"""
        return hands.active_window()

    @mcp.tool()
    def list_windows() -> str:
        """開いているウィンドウの一覧。"""
        return hands.list_windows()

    @mcp.tool()
    def focus_window(title_contains: str) -> str:
        """ウィンドウを前面に出す。操作したいアプリを先にこれで出しておく。

        Args:
            title_contains: ウィンドウタイトルに含まれる文字列。
        """
        return hands.focus_window(title_contains)

    @mcp.tool()
    def click_control(name: str) -> str:
        """名前で部品を探して押す。座標より確実なので、こちらを先に試すこと。

        Args:
            name: ボタンやリンクの表示名。
        """
        return hands.click_control(name)

    @mcp.tool()
    def click_at(x: int, y: int, button: str = "left", double: bool = False) -> str:
        """座標を押す。click_control で届かないときの手段。

        押す前にその場所の部品名を読み取るので、「送信」のような
        取り返しのつかないボタンだった場合は、持ち主への確認が入る。

        Args:
            x: 画面の左からの位置。
            y: 画面の上からの位置。
            button: left / right / middle。
            double: 二度押しにするか。
        """
        return hands.click_at(x, y, button=button, double=double)

    @mcp.tool()
    def type_text(text: str) -> str:
        """文字を入力する。日本語も入る。

        パスワードやカード番号らしき内容は、そのままでは入力せず確認を求める。

        Args:
            text: 入力する文字列。
        """
        return hands.type_text(text)

    @mcp.tool()
    def press_keys(keys: list[str]) -> str:
        """キーの組み合わせを押す。

        Args:
            keys: 例 ["ctrl", "s"] や ["alt", "tab"]。
        """
        return hands.press_keys(keys)

    @mcp.tool()
    def scroll(amount: int) -> str:
        """画面を送る。正の数で上へ、負の数で下へ。

        Args:
            amount: 送る量。
        """
        return hands.scroll(amount)

    return mcp


def serve(config: Config | None = None) -> None:
    config = config or get_config()
    server = create_server(config)
    log.info(
        "手の窓口を開きます",
        url=f"http://{config.hands.listen_host}:{config.hands.listen_port}/mcp",
    )
    server.run(transport="streamable-http")


if __name__ == "__main__":
    serve()
