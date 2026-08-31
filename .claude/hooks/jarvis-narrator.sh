#!/usr/bin/env bash
# 15秒ごとに「いま何をしているか」を読み上げる常駐プロセス。
# SessionStart / UserPromptSubmit フックから起動される。
set -u

sid="${1:-default}"
dir="$HOME/.claude/jarvis"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
interval="${JARVIS_INTERVAL:-15}"

mkdir -p "$dir"
statefile="$dir/$sid.state"
statusfile="$dir/$sid.status"
pidfile="$dir/$sid.pid"

# 二重起動を防ぐ
if [ -f "$pidfile" ]; then
  old="$(cat "$pidfile" 2>/dev/null || true)"
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then exit 0; fi
fi
echo $$ > "$pidfile"
sleep_pid=""
cleanup() { [ -n "$sleep_pid" ] && kill "$sleep_pid" 2>/dev/null; rm -f "$pidfile"; }
trap 'cleanup; exit 0' TERM INT
trap cleanup EXIT

last=""
idle_ticks=0
# アイドルが30分続いたら見張りを終える（セッション終了を取りこぼした場合の保険）
max_idle=$(( 1800 / interval ))

while true; do
  # sleep を子プロセスにして wait することで、停止の合図に即座に反応できるようにする
  sleep "$interval" & sleep_pid=$!
  wait "$sleep_pid" 2>/dev/null || true
  sleep_pid=""

  state="$(cat "$statefile" 2>/dev/null || echo idle)"
  if [ "$state" != "active" ]; then
    idle_ticks=$(( idle_ticks + 1 ))
    [ "$idle_ticks" -gt "$max_idle" ] && exit 0
    continue
  fi
  idle_ticks=0

  current="$(cat "$statusfile" 2>/dev/null || true)"
  [ -z "$current" ] && current="作業を進めています"

  if [ "$current" = "$last" ]; then
    "$here/jarvis-speak.sh" "引き続き、$current"
  else
    "$here/jarvis-speak.sh" "$current"
    last="$current"
  fi
done
