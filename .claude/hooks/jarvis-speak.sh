#!/usr/bin/env bash
# 渡されたテキストを音声で読み上げる。
# 環境に応じて使える読み上げコマンドを自動で選ぶ。どれも無ければ端末に出すだけ。
set -u

text="${1:-}"
[ -z "$text" ] && exit 0

log_dir="$HOME/.claude/jarvis"
mkdir -p "$log_dir"
printf '%s  %s\n' "$(date '+%H:%M:%S')" "$text" >> "$log_dir/spoken.log"

# JARVIS_TTS_CMD で明示的に指定されていればそれを最優先で使う
# 例: export JARVIS_TTS_CMD="say -v Otoya"
if [ -n "${JARVIS_TTS_CMD:-}" ]; then
  # shellcheck disable=SC2086
  $JARVIS_TTS_CMD "$text" >/dev/null 2>&1 && exit 0
fi

voice="${JARVIS_VOICE:-}"

# macOS
if command -v say >/dev/null 2>&1; then
  if [ -z "$voice" ]; then
    for v in Kyoko Otoya; do
      if say -v '?' 2>/dev/null | grep -q "^$v"; then voice="$v"; break; fi
    done
  fi
  if [ -n "$voice" ]; then
    say -v "$voice" "$text" >/dev/null 2>&1 && exit 0
  else
    say "$text" >/dev/null 2>&1 && exit 0
  fi
fi

# Linux (speech-dispatcher / espeak)
if command -v spd-say >/dev/null 2>&1; then
  spd-say -l ja -w "$text" >/dev/null 2>&1 && exit 0
fi
for engine in espeak-ng espeak; do
  if command -v "$engine" >/dev/null 2>&1; then
    "$engine" -v ja "$text" >/dev/null 2>&1 && exit 0
  fi
done

# Windows / WSL / Git Bash
if command -v powershell.exe >/dev/null 2>&1; then
  escaped="${text//\'/\'\'}"
  powershell.exe -NoProfile -Command \
    "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('$escaped')" \
    >/dev/null 2>&1 && exit 0
fi

# 読み上げ手段がない環境（CI・リモートコンテナなど）では文字で出す
printf '\a[JARVIS] %s\n' "$text"
