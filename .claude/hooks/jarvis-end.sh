#!/usr/bin/env bash
# Stop フック。作業が終わったので読み上げを止め、完了を知らせる。
set -u

dir="$HOME/.claude/jarvis"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$dir"

payload="$(cat 2>/dev/null || true)"
sid="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null || true)"
[ -z "$sid" ] && sid="$(cat "$dir/latest.sid" 2>/dev/null || echo default)"

printf 'idle' > "$dir/$sid.state"
printf '' > "$dir/$sid.status"

"$here/jarvis-speak.sh" "作業が完了しました。内容をご確認ください" >/dev/null 2>&1 || true
exit 0
