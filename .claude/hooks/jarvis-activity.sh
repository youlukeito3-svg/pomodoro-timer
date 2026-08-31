#!/usr/bin/env bash
# PreToolUse フック。使おうとしているツールから「いま何をしているか」を組み立てて記録する。
# 読み上げるのは常駐プロセス（jarvis-narrator.sh）なので、ここでは書くだけ。
set -u

dir="$HOME/.claude/jarvis"
mkdir -p "$dir"

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0

sid="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null || true)"
[ -z "$sid" ] && sid="$(cat "$dir/latest.sid" 2>/dev/null || echo default)"

tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null || true)"
[ -z "$tool" ] && exit 0

field() {
  printf '%s' "$payload" | jq -r "$1" 2>/dev/null \
    | tr '\n' ' ' | cut -c1-80 | sed 's/[[:space:]]*$//'
}

case "$tool" in
  Bash|BashOutput)
    desc="$(field '.tool_input.description // empty')"
    [ -z "$desc" ] && desc="$(field '.tool_input.command // empty')"
    msg="コマンドを実行しています。${desc}"
    ;;
  Read|NotebookRead)
    msg="$(basename "$(field '.tool_input.file_path // empty')") を読んでいます"
    ;;
  Edit|Write|NotebookEdit|MultiEdit)
    msg="$(basename "$(field '.tool_input.file_path // empty')") を書き換えています"
    ;;
  Grep|Glob)
    msg="コードの中を検索しています"
    ;;
  WebFetch|WebSearch)
    msg="ウェブで調べものをしています"
    ;;
  Task|Agent)
    msg="別のエージェントに作業を任せています"
    ;;
  Skill)
    msg="$(field '.tool_input.skill // empty') のスキルを実行しています"
    ;;
  TodoWrite|TaskCreate|TaskUpdate)
    msg="作業の段取りを整理しています"
    ;;
  AskUserQuestion)
    msg="確認したいことがあるので、お返事をお待ちしています"
    ;;
  *)
    msg="${tool} を実行しています"
    ;;
esac

printf '%s' "$msg" > "$dir/$sid.status"
printf 'active' > "$dir/$sid.state"
exit 0
