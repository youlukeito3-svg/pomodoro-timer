"""Google の MCP サーバ。予定・メール・資料の窓口。

予定の正本は Google カレンダーで、ここがその入口になる。SQLite の tasks は
「なぜその予定を入れたか」を覚えておくための控えで、時刻の真実ではない。

メールは読むことと下書きまでで、送信の権限を取っていない。持ち主の許可なく
外へ何かを送る事故は、権限を持たないことで防ぐのがいちばん確実。

    claude mcp add --transport http google http://127.0.0.1:8768/mcp
"""

from __future__ import annotations

import base64
from datetime import datetime, timedelta

from ..brain.agenda import (
    Event, check_before_create, describe_day, describe_gap, event_from_api, say_time,
)
from ..config import Config, get_config
from ..log import get_logger
from .google_auth import GoogleAuth, GoogleAuthError

log = get_logger("予定")


class GoogleDesk:
    def __init__(self, config: Config, auth: GoogleAuth | None = None) -> None:
        self._config = config
        self._auth = auth or GoogleAuth(config)

    # ---------------------------------------------------------------- 予定

    def _calendar(self):
        return self._auth.service("calendar", "v3")

    def events_between(self, start: datetime, end: datetime) -> list[Event]:
        response = (
            self._calendar()
            .events()
            .list(
                calendarId=self._config.google.calendar_id,
                timeMin=start.astimezone().isoformat(),
                timeMax=end.astimezone().isoformat(),
                singleEvents=True,
                orderBy="startTime",
                maxResults=50,
            )
            .execute()
        )
        return [event_from_api(item) for item in response.get("items", [])]

    def list_events(self, days: int = 1) -> str:
        start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        events = self.events_between(start, start + timedelta(days=days))
        if not events:
            return "予定はありません。"
        lines = [describe_day(events), "", "詳細:"]
        for e in events:
            when = "終日" if e.all_day else f"{say_time(e.start)}〜{say_time(e.end)}"
            where = f"（{e.location}）" if e.location else ""
            lines.append(f"- {e.start:%m/%d} {when} {e.summary}{where} [{e.event_id}]")
        return "\n".join(lines)

    def next_up(self) -> str:
        start = datetime.now()
        return describe_gap(self.events_between(start, start + timedelta(days=2)), now=start)

    def create_event(
        self, summary: str, start: str, end: str,
        description: str = "", location: str = "",
    ) -> str:
        begins, ends = datetime.fromisoformat(start), datetime.fromisoformat(end)
        day_start = begins.replace(hour=0, minute=0, second=0, microsecond=0)
        existing = self.events_between(day_start, day_start + timedelta(days=1))

        warning = check_before_create(
            existing, begins, ends, travel_minutes=self._config.google.travel_minutes
        )
        if warning:
            # 作らずに返す。持ち主に伝えたうえで、もう一度指示してもらう。
            return f"入れませんでした。{warning}それでもよければ、そう言ってください。"

        body = {
            "summary": summary,
            "start": {"dateTime": begins.astimezone().isoformat()},
            "end": {"dateTime": ends.astimezone().isoformat()},
        }
        if description:
            body["description"] = description
        if location:
            body["location"] = location

        created = (
            self._calendar()
            .events()
            .insert(calendarId=self._config.google.calendar_id, body=body)
            .execute()
        )
        return f"{begins:%m/%d} {say_time(begins)}から「{summary}」を入れました。[{created['id']}]"

    def force_create_event(
        self, summary: str, start: str, end: str,
        description: str = "", location: str = "",
    ) -> str:
        begins, ends = datetime.fromisoformat(start), datetime.fromisoformat(end)
        body = {
            "summary": summary,
            "start": {"dateTime": begins.astimezone().isoformat()},
            "end": {"dateTime": ends.astimezone().isoformat()},
        }
        if description:
            body["description"] = description
        if location:
            body["location"] = location
        created = (
            self._calendar()
            .events()
            .insert(calendarId=self._config.google.calendar_id, body=body)
            .execute()
        )
        return f"重なりを承知で「{summary}」を入れました。[{created['id']}]"

    def move_event(self, event_id: str, start: str, end: str) -> str:
        begins, ends = datetime.fromisoformat(start), datetime.fromisoformat(end)
        self._calendar().events().patch(
            calendarId=self._config.google.calendar_id,
            eventId=event_id,
            body={
                "start": {"dateTime": begins.astimezone().isoformat()},
                "end": {"dateTime": ends.astimezone().isoformat()},
            },
        ).execute()
        return f"{begins:%m/%d} {say_time(begins)}に動かしました。"

    def delete_event(self, event_id: str) -> str:
        self._calendar().events().delete(
            calendarId=self._config.google.calendar_id, eventId=event_id
        ).execute()
        return "予定を消しました。"

    # ---------------------------------------------------------------- メール

    def _gmail(self):
        return self._auth.service("gmail", "v1")

    def search_mail(self, query: str, limit: int = 10) -> str:
        gmail = self._gmail()
        found = gmail.users().messages().list(
            userId="me", q=query, maxResults=limit
        ).execute()
        ids = [m["id"] for m in found.get("messages", [])]
        if not ids:
            return "該当するメールはありません。"

        lines = []
        for message_id in ids:
            message = gmail.users().messages().get(
                userId="me", id=message_id, format="metadata",
                metadataHeaders=["From", "Subject", "Date"],
            ).execute()
            headers = {h["name"]: h["value"] for h in message["payload"].get("headers", [])}
            lines.append(
                f"- {headers.get('Date', '')} {headers.get('From', '')}"
                f"「{headers.get('Subject', '(件名なし)')}」[{message_id}]"
            )
        return "\n".join(lines)

    def read_mail(self, message_id: str) -> str:
        message = self._gmail().users().messages().get(
            userId="me", id=message_id, format="full"
        ).execute()
        return _extract_body(message.get("payload", {})) or "本文を取り出せませんでした。"

    def draft_reply(self, to: str, subject: str, body: str) -> str:
        """下書きまで。送信の権限は持っていないので、送るのは持ち主の手。"""
        raw = base64.urlsafe_b64encode(
            f"To: {to}\r\nSubject: {subject}\r\n\r\n{body}".encode()
        ).decode()
        draft = self._gmail().users().drafts().create(
            userId="me", body={"message": {"raw": raw}}
        ).execute()
        return (
            f"{to} 宛の下書きを作りました。送信はしていません。"
            f"Gmail で確かめてから送ってください。[{draft['id']}]"
        )

    # ---------------------------------------------------------------- 資料

    def _drive(self):
        return self._auth.service("drive", "v3")

    def search_drive(self, query: str, limit: int = 10) -> str:
        response = self._drive().files().list(
            q=f"name contains '{query}' and trashed = false",
            pageSize=limit, fields="files(id, name, mimeType, modifiedTime)",
        ).execute()
        files = response.get("files", [])
        if not files:
            return "該当するファイルはありません。"
        return "\n".join(
            f"- {f['name']}（{f['modifiedTime'][:10]}）[{f['id']}]" for f in files
        )

    def read_drive_file(self, file_id: str) -> str:
        drive = self._drive()
        meta = drive.files().get(fileId=file_id, fields="name, mimeType").execute()
        mime = meta.get("mimeType", "")
        if mime.startswith("application/vnd.google-apps."):
            content = drive.files().export(fileId=file_id, mimeType="text/plain").execute()
        else:
            content = drive.files().get_media(fileId=file_id).execute()
        text = content.decode("utf-8", errors="replace") if isinstance(content, bytes) else str(content)
        return f"# {meta.get('name')}\n\n{text[:20000]}"


def _extract_body(payload: dict) -> str:
    """メールの本文を取り出す。入れ子になっていることがある。"""
    if payload.get("mimeType") == "text/plain":
        data = payload.get("body", {}).get("data")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    for part in payload.get("parts", []):
        found = _extract_body(part)
        if found:
            return found
    return ""


def create_server(config: Config, desk: GoogleDesk | None = None):
    from mcp.server.fastmcp import FastMCP

    desk = desk or GoogleDesk(config)
    mcp = FastMCP(
        "jarvis-google", host=config.google.mcp_host, port=config.google.mcp_port
    )

    def guarded(func, *args, **kwargs) -> str:
        try:
            return func(*args, **kwargs)
        except GoogleAuthError as e:
            return f"Google と繋がっていません。{e}"
        except Exception as e:  # noqa: BLE001 - API は色々な形で失敗する
            log.error("Google の呼び出しに失敗しました", exc_info=True, error=str(e))
            return f"うまくいきませんでした: {e}"

    @mcp.tool()
    def list_events(days: int = 1) -> str:
        """予定を見る。予定の話をするときは、まずこれで今の状態を確かめる。

        Args:
            days: 今日から何日分か。1 なら今日だけ。
        """
        return guarded(desk.list_events, days)

    @mcp.tool()
    def next_up() -> str:
        """次の予定までどれくらいあるか。"""
        return guarded(desk.next_up)

    @mcp.tool()
    def create_event(
        summary: str, start: str, end: str, description: str = "", location: str = ""
    ) -> str:
        """予定を入れる。重なりと移動時間を先に確かめ、問題があれば入れずに知らせる。

        入れなかった場合は、その理由を持ち主に伝えて指示を仰ぐこと。
        承知のうえで入れたいと言われたときだけ force_create_event を使う。

        Args:
            summary: 予定の名前。
            start: 開始（2026-08-21T10:00:00 の形）。
            end: 終了（同じ形）。
            description: 補足。
            location: 場所。移動時間の判断に使う。
        """
        return guarded(desk.create_event, summary, start, end, description, location)

    @mcp.tool()
    def force_create_event(
        summary: str, start: str, end: str, description: str = "", location: str = ""
    ) -> str:
        """重なりを承知で予定を入れる。持ち主がそう言ったときだけ使う。

        Args:
            summary: 予定の名前。
            start: 開始。
            end: 終了。
            description: 補足。
            location: 場所。
        """
        return guarded(desk.force_create_event, summary, start, end, description, location)

    @mcp.tool()
    def move_event(event_id: str, start: str, end: str) -> str:
        """予定を動かす。

        Args:
            event_id: list_events が返した角括弧の中の ID。
            start: 新しい開始。
            end: 新しい終了。
        """
        return guarded(desk.move_event, event_id, start, end)

    @mcp.tool()
    def delete_event(event_id: str) -> str:
        """予定を消す。消す前に必ず持ち主に確かめること。

        Args:
            event_id: list_events が返した角括弧の中の ID。
        """
        return guarded(desk.delete_event, event_id)

    @mcp.tool()
    def search_mail(query: str, limit: int = 10) -> str:
        """メールを探す。Gmail の検索式がそのまま使える。

        Args:
            query: 例 "is:unread from:example.com newer_than:3d"。
            limit: 何件まで。
        """
        return guarded(desk.search_mail, query, limit)

    @mcp.tool()
    def read_mail(message_id: str) -> str:
        """メールの本文を読む。

        Args:
            message_id: search_mail が返した角括弧の中の ID。
        """
        return guarded(desk.read_mail, message_id)

    @mcp.tool()
    def draft_reply(to: str, subject: str, body: str) -> str:
        """返信の下書きを作る。**送信はできない**（その権限を持っていない）。

        下書きを作ったことは持ち主に伝え、送るかどうかは持ち主に決めさせる。

        Args:
            to: 宛先。
            subject: 件名。
            body: 本文。
        """
        return guarded(desk.draft_reply, to, subject, body)

    @mcp.tool()
    def search_drive(query: str, limit: int = 10) -> str:
        """Google ドライブのファイルを名前で探す。

        Args:
            query: ファイル名に含まれる文字列。
            limit: 何件まで。
        """
        return guarded(desk.search_drive, query, limit)

    @mcp.tool()
    def read_drive_file(file_id: str) -> str:
        """Google ドライブのファイルを読む。ドキュメントは平文にして返す。

        Args:
            file_id: search_drive が返した角括弧の中の ID。
        """
        return guarded(desk.read_drive_file, file_id)

    return mcp


def serve(config: Config | None = None) -> None:
    config = config or get_config()
    server = create_server(config)
    log.info(
        "予定の窓口を開きます",
        url=f"http://{config.google.mcp_host}:{config.google.mcp_port}/mcp",
    )
    server.run(transport="streamable-http")


if __name__ == "__main__":
    serve()
