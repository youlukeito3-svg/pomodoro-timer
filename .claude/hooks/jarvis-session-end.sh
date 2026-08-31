#!/usr/bin/env bash
# SessionEnd フック。常駐プロセスを片付ける。
set -u

dir="$HOME/.claude/jarvis"
payload="$(cat 2>/dev/null || true)"
sid="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null || true)"
[ -z "$sid" ] && sid="$(cat "$dir/latest.sid" 2>/dev/null || echo default)"

pidfile="$dir/$sid.pid"
if [ -f "$pidfile" ]; then
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  rm -f "$pidfile"
fi
rm -f "$dir/$sid.state" "$dir/$sid.status"
exit 0
