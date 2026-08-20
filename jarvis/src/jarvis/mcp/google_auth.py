"""Google への認証。デスクトップ用の OAuth を一度だけ通す。

権限は要るものだけに絞ってある。とくにメールは **読むことと下書きまで**で、
送信の権限を取っていない。持ち主の許可なく外へ何かを送る、という事故は
仕組みとして起こせないようにしておくのがいちばん確実だから。

送信が要るようになったら、ここに `gmail.send` を足す判断を、
そのときに意識して行うことになる。それでよい。
"""

from __future__ import annotations

from pathlib import Path

from ..config import Config
from ..log import get_logger

log = get_logger("予定")

SCOPES = [
    # 予定は読み書きする。これが本題。
    "https://www.googleapis.com/auth/calendar",
    # メールは読むだけ。
    "https://www.googleapis.com/auth/gmail.readonly",
    # 下書きは作れる。送信はできない。
    "https://www.googleapis.com/auth/gmail.compose",
    # ファイルは読むだけ。
    "https://www.googleapis.com/auth/drive.readonly",
]


class GoogleAuthError(RuntimeError):
    pass


class GoogleAuth:
    def __init__(self, config: Config) -> None:
        self._credentials_path = config.paths.data / config.google.credentials_file
        self._token_path = config.paths.data / config.google.token_file
        self._creds = None

    @property
    def token_path(self) -> Path:
        return self._token_path

    def credentials(self):
        if self._creds is not None and self._creds.valid:
            return self._creds

        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow

        creds = None
        if self._token_path.exists():
            creds = Credentials.from_authorized_user_file(str(self._token_path), SCOPES)

        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:  # noqa: BLE001 - 期限切れの直し方は取り直すだけ
                log.warning("認証を更新できませんでした。取り直します", error=str(e))
                creds = None

        if not creds or not creds.valid:
            if not self._credentials_path.exists():
                raise GoogleAuthError(
                    f"{self._credentials_path} がありません。"
                    "README の「Google と繋ぐ」の手順で用意してください。"
                )
            flow = InstalledAppFlow.from_client_secrets_file(
                str(self._credentials_path), SCOPES
            )
            # ブラウザが開く。一度だけ許可すれば、以降は token.json で通る。
            creds = flow.run_local_server(port=0)
            self._token_path.parent.mkdir(parents=True, exist_ok=True)
            self._token_path.write_text(creds.to_json(), encoding="utf-8")
            self._token_path.chmod(0o600)
            log.info("Google と繋がりました", token=str(self._token_path))

        self._creds = creds
        return creds

    def service(self, name: str, version: str):
        from googleapiclient.discovery import build

        return build(name, version, credentials=self.credentials(), cache_discovery=False)
