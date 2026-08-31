#!/usr/bin/env bash
# SessionStart と UserPromptSubmit で走る。
# 読み上げの常駐プロセスを起動し、状態を「作業中」にする。
set -u

dir="$HOME/.claude/jarvis"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$dir"

payload="$(cat 2>/dev/null || true)"
sid="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null || true)"
[ -z "$sid" ] && sid="default"

printf '%s' "$sid" > "$dir/latest.sid"
printf 'active' > "$dir/$sid.state"
[ -s "$dir/$sid.status" ] || printf 'ご依頼を受け取りました。着手します' > "$dir/$sid.status"

nohup "$here/jarvis-narrator.sh" "$sid" >/dev/null 2>&1 &
exit 0
