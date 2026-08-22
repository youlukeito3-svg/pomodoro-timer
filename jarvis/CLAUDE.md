# ジャービス — 開発者向け指示

このファイルは、`jarvis/` ディレクトリを開いて動く Claude Code（自宅 Windows 11
PC の WSL(Ubuntu) 側）に向けた、開発とセットアップの手順書。**人格ではない。**

ジャービス本体の人格（執事として振る舞う指示）は `jarvis/claude/persona.md` に
別にあり、そちらは頭（起動後に tmux へ常駐する別の Claude Code セッション）だけに
配られる。両者は名前が衝突していたため分けてある（経緯は git log 参照）。

このリポジトリのルート（`jarvis/` の一つ上）にある `CLAUDE.md` / `AGENTS.md` は、
親の Next.js アプリ（pomodoro-timer）向けの注意書きで、jarvis の作業には
**無関係**。`jarvis/` 配下だけを見て作業すること。

---

## このプロジェクトについて

「ジャービス」は常時起動の Windows 11 PC 上で動く、声で呼びかけると Claude Code が
動く常駐アシスタント。詳しい全体像・設計判断・課金をゼロにする仕組みは
`jarvis/README.md` を読むこと。作業前に必ず一読する。

コードは Windows ネイティブで動く必要がある部分（音声デバイス・pyautogui による
PC 操作）と、Claude Code（頭）が動く WSL 側に分かれている。この Claude Code
自身は WSL の中で動いているので、`jarvis/` 配下のコードを直接読み書きできる。
Python の実行やテストは、Windows 側の venv
（`C:\Users\<user>\jarvis-src\jarvis\.venv`）で行うほうが確実な場合がある
（音声・PC 操作の依存が Windows 専用のため）。純粋ロジックのテスト
（`cd jarvis && pytest`）は WSL 側の Python でも通る。

## 開発の心得

- **変更のたびに `cd jarvis && pytest` を実行する。** 現在 230 件超が通っている
  状態を保つこと。
- **課金をゼロにする設計を絶対に崩さない**（`jarvis/README.md` の「課金を発生させ
  ないための約束」）。特に `ANTHROPIC_API_KEY` 等が環境にあると doctor が起動を
  拒否する仕組み、頭を tmux 常駐の対話セッションで動かす方式（`driver = "tmux"`）
  は、理由があってそうしてある。「もっと簡単にできる」と思っても、まず
  README を読み直すこと。
- `config/allowlist.yaml` を自動で書き換えない。アプリの許可を足す判断は
  持ち主に確認する。
- 記憶（`~/jarvis-data`）は個人データなので、公開リポジトリへコミットしない。
  jarvis のコード自体は当面パブリックな `pomodoro-timer` リポジトリのブランチに
  残る想定（非公開リポへの移行は別作業）。

## このマシンでのセットアップの進め方

決まっている構成:

- PC 側の Claude Code は WSL(Ubuntu) の中で動く（いま動いているのがそれ）
- コードは `C:\Users\<user>\jarvis-src` に clone してあり、WSL からは
  `/mnt/c/Users/<user>/jarvis-src` として触る
- ログオン時にタスクスケジューラで自動起動する

手順:

1. `jarvis/scripts/setup-wsl.sh` を WSL 側（このシェル）で実行する。
   tmux の導入、`claude` コマンドの有無、課金経路になる環境変数が無いことを
   機械的に確認する。
2. `jarvis/scripts/setup-windows.ps1` を **Windows 側の PowerShell** で実行する
   よう、持ち主に依頼する（WSL からは実行できない）。Python・Ollama・venv・
   依存関係・Ollama モデル・WSL2 のミラーモード設定・記憶/作業ディレクトリの
   雛形を用意する。
3. 判断の要る残りの設定を、対話しながら進める。
   - AivisSpeech（または VOICEVOX）を導入・起動してもらい、`config/jarvis.toml`
     の `speaker_id` を一緒に選ぶ
   - `~/jarvis-data` を非公開の GitHub リポジトリとして初期化する
     （`jarvis/README.md` の「記憶を非公開リポにする」節の手順）
   - Google 連携が要るか確認し、要るなら OAuth の手順を案内する
   - `~/jarvis-data/memory/profile.md` の記入を手伝う
4. `python -m jarvis warmup` を実行し、聞き取りモデルが実際に読み込めるか
   （CUDA 関連の DLL が揃っているか）を確かめる。失敗したら
   `config/jarvis.toml` の `[ears.stt]` を `device = "cpu"` に変えるか、
   足りない CUDA ライブラリを案内する。
5. `python -m jarvis doctor` を実行し、fatal が無いことを確認する。
6. 動作確認ができたら `jarvis/scripts/autostart-install.ps1` を Windows 側で
   実行してもらい、タスクスケジューラへの自動起動を登録する。

セットアップスクリプト（`.sh` / `.ps1`）は機械的に決まることだけをやる。
config の書き換え、話者 ID の選択、`profile.md` の記入のような判断が要ることは、
このセッションが持ち主と対話しながら進める。
