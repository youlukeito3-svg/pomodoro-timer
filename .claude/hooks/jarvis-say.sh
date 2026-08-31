#!/usr/bin/env bash
# 「いま何をしているか」を自分の言葉で更新する。次の読み上げ（最大15秒後）で伝わる。
# 使い方: .claude/hooks/jarvis-say.sh "テストの失敗を調べています"
set -u

text="${1:-}"
[ -z "$text" ] && exit 0

dir="$HOME/.claude/jarvis"
mkdir -p "$dir"
sid="$(cat "$dir/latest.sid" 2>/dev/null || echo default)"

printf '%s' "$text" > "$dir/$sid.status"
printf 'active' > "$dir/$sid.state"
exit 0
