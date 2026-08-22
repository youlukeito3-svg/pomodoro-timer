#!/usr/bin/env bash
# ジャービス: WSL 側のセットアップ。
#
# ここでやるのは機械的に決まることだけ（tmux を入れる、claude の有無を見る、
# 課金経路になる環境変数が無いかを見る）。config の書き換えや判断の要ることは
# PC 側の Claude Code（jarvis/CLAUDE.md の指示）にやらせる。
set -euo pipefail

echo "== ジャービス: WSL 側のセットアップ =="
echo

# --- 1. tmux -----------------------------------------------------------
if command -v tmux >/dev/null 2>&1; then
    echo "-- tmux は入っています ($(tmux -V))"
else
    echo "-- tmux を入れます"
    sudo apt-get update
    sudo apt-get install -y tmux
fi

# --- 2. claude -----------------------------------------------------------
if command -v claude >/dev/null 2>&1; then
    echo "-- claude は入っています ($(claude --version 2>&1 | head -n1))"
else
    echo "!! claude コマンドが見つかりません。"
    echo "   公式の手順で Claude Code を導入し、'claude' を一度実行して"
    echo "   ブラウザでサブスクリプション（Pro / Max）のアカウントにログインしてください。"
    echo "   導入できたら、このスクリプトをもう一度実行してください。"
    exit 1
fi

# --- 3. 課金経路になる環境変数 --------------------------------------------
echo "-- 課金経路になる環境変数を確認します"
BILLING_VARS="ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BEDROCK_BASE_URL ANTHROPIC_VERTEX_BASE_URL CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX"
found=0
for v in $BILLING_VARS; do
    if [ -n "${!v:-}" ]; then
        echo "!! 環境変数 $v が設定されています。unset するか、ログインシェルの設定から削除してください。"
        found=1
    fi
    for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
        if [ -f "$rc" ] && grep -qE "^[^#]*export[[:space:]]+$v=" "$rc" 2>/dev/null; then
            echo "!! $rc に $v の export が書かれています。削除してください。"
            found=1
        fi
    done
done
if [ "$found" = "1" ]; then
    echo
    echo "!! 従量課金の経路につながる設定が見つかりました。上記を直してから、"
    echo "   このスクリプトをもう一度実行してください。ジャービスはこの状態では起動を拒否します。"
    exit 1
fi
echo "-- 課金経路になる環境変数はありません"

echo
echo "== WSL 側のセットアップは完了です =="
echo "次は Windows 側（PowerShell）で jarvis/scripts/setup-windows.ps1 を実行してください。"
