# ジャービス

「ジャービス」と呼びかけると聞き取りが始まり、音声で指示を出すと音声で返る。
中身では Claude Code が動いていて、予定の管理から「新しいシステムを作る」ところまでこなす。

常時起動の Windows 11 + NVIDIA GPU が前提。**運用にお金はかからない。**
Claude はサブスクリプションだけを使い、それ以外の部品はすべてローカルか無料枠で動く。

---

## 課金を発生させないための約束

これが設計上いちばん重い制約なので、最初に書く。

### 1. API キーを環境に置かない

`ANTHROPIC_API_KEY` があると、Claude Code はサブスクではなく API 課金の経路で動く。
ジャービスは起動時にこれを検査して、見つかったら**起動を拒否する**。

```powershell
Get-ChildItem Env:ANTHROPIC_*     # 何も出なければ正しい
```

キーが無ければ、従量課金の経路が物理的に存在しない。これがいちばん確実な担保になる。

### 2. アカウント側の従量課金を無効のままにする

claude.ai の設定で、従量課金（usage credits）を**有効にしない**。
これで上限に達したときは課金されず、単に止まる。

### 3. 頭は対話セッションで動かす

Anthropic は 2026年5月、`claude -p`（ヘッドレス）と Agent SDK をサブスク枠から外して
別枠の月額クレジットに移す、と発表した。この変更は**6月15日に撤回**され、
2026年8月現在も `claude -p` はサブスク枠のまま動く。ただし
「作り直して事前告知の上で再導入する」とも言っている。

対話セッションはこの話の対象外なので、ジャービスは既定で
**tmux に常駐させた対話セッションに指示を流し込む**方式を使う。
方針がまた変わっても、この方式なら巻き込まれない。

`config/jarvis.toml` の `driver = "headless"` にすれば `claude -p` に切り替わる。
速いが、将来の課金方針の変更を受ける側に立つことになる。

### 4. 呼びすぎない

1日／1週の呼び出し回数に上限を置いてある（既定 120回／500回）。
超えたら音声で断る。枠を使い切って肝心なときに動かない、を防ぐため。

```powershell
python -m jarvis budget
```

さらに、時刻・タイマー・返事のような**規則で決まる用事は Claude を呼ばずに済ませる**。
「今何時」を聞くたびに枠を1本使うのは馬鹿げている。

---

## 全体像

```
マイク
 └─[耳] openWakeWord "hey_jarvis" で待機 → 音量で発話を切り出す
        → faster-whisper large-v3-turbo (CUDA) で日本語に起こす
 └─[振り分け] Ollama の小型 LLM で意図を分類
        ├─ 定型（時刻・タイマー・返事）→ Claude を呼ばず即応
        ├─ 雑談 → ローカルで一言返す
        └─ それ以外 → [頭] へ
 └─[頭] tmux に常駐する Claude Code 対話セッション
        ├─ MCP: hands   … Windows のマウス/キーボード（許可リスト付き）
        ├─ MCP: memory  … 記憶の想起と記録
        ├─ MCP: google  … カレンダー / Gmail / ドライブ
        ├─ MCP: browser … Playwright
        └─ 通常の Read/Write/Bash … 新しいものを作るのはここ
 └─[口] Stop フックが応答を拾い、AivisSpeech で読み上げる
 └─[記憶] SQLite + Markdown → 非公開 GitHub リポへ自動コミット

Discord ボット ──→ 同じ[振り分け]に入る（外出先から）
```

### なぜ Windows と WSL に分かれているか

音声デバイスと Windows の UI 操作は Windows ネイティブが圧倒的に扱いやすく、
Claude Code は Unix 環境が最も安定する。だから境界を1本だけ引いた。

| 役 | 置き場所 |
|---|---|
| 耳・口・手・振り分け・記憶・予定・Discord | Windows ネイティブ Python |
| 頭（Claude Code） | WSL2 Ubuntu + tmux |

橋渡しは `localhost`。WSL2 をミラーモードにすれば双方向に通るので、
どちらの側もお互いのパスを知らなくて済む。

---

## 用意するもの

判断が要らない部分（Python・Ollama の導入、依存関係、Ollama のモデル取得、
WSL2 のミラーモード設定など）はスクリプトが自動でやる。話者 ID の選択、
`~/jarvis-data` の非公開リポ化、Google 連携、`profile.md` の記入のような
判断が要ることは、PC 側の Claude Code と対話しながら進める。

### 前提

- Windows 11 + NVIDIA GPU（常時起動）
- WSL2 に Ubuntu が入っていること（無ければ `wsl --install -d Ubuntu` を実行し、
  再起動後にユーザー名とパスワードを設定する）
- コードを `C:\Users\<あなた>\jarvis-src` に clone してあること

```powershell
git clone -b claude/jarvis-assistant-system-5h1208 `
  https://github.com/youlukeito3-svg/pomodoro-timer.git C:\Users\<あなた>\jarvis-src
```

### 進め方（推奨）

1. WSL を開き、`jarvis/` ディレクトリで Claude Code を起動する
   （未導入なら先に入れて、サブスクリプション＝Pro/Max のアカウントでログインする）。

   ```bash
   wsl
   cd /mnt/c/Users/<あなた>/jarvis-src/jarvis
   claude
   ```

2. 次のプロンプトを貼り付ける。

   ```
   このリポジトリの jarvis/CLAUDE.md を読んでください。そこに書かれた手順で、
   このマシンにジャービスを導入してください。jarvis/scripts/setup-wsl.sh を
   まず実行し、jarvis/scripts/setup-windows.ps1 は私（Windows 側の
   PowerShell）に実行を頼んでください。そのあと、AivisSpeech の導入と話者
   選び、記憶を非公開リポにする作業、Google 連携が要るかの確認、
   python -m jarvis warmup による CUDA の確認、doctor での最終確認、
   自動起動（autostart-install.ps1）の登録までを、対話しながら一つずつ
   進めてください。
   ```

3. あとは Claude Code の指示に従う。判断を求められたら答え、Windows 側での
   実行を頼まれたら PowerShell で実行する。詰まったら `python -m jarvis doctor`
   の出力と、この README の「困ったとき」を見る。

一つずつ手作業で進めたい場合、または Claude Code を介さずに確かめたい場合は、
以下の各節を参照（`setup-wsl.sh` / `setup-windows.ps1` がやっていることの中身でもある）。

### 1. WSL2 をミラーモードにする

`C:\Users\<あなた>\.wslconfig` を作る（無ければ新規）。

```ini
[wsl2]
networkingMode=mirrored
```

```powershell
wsl --shutdown        # 設定を効かせるために一度落とす
```

### 2. WSL 側に Claude Code と tmux

```bash
wsl
sudo apt update && sudo apt install -y tmux
# Claude Code を入れて、サブスクリプションでログインする
claude          # ブラウザが開くので、Pro / Max のアカウントで認証する
claude --version
```

**ここで `export ANTHROPIC_API_KEY=...` を `.bashrc` に書かないこと。** 書くと課金経路が開く。

### 3. Windows 側に Python と部品

```powershell
winget install Python.Python.3.12
winget install Ollama.Ollama

cd C:\jarvis            # このディレクトリを置いた場所
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[ears,mouth,hands,memory,google,remote,dev]"
```

### 4. Ollama のモデル

振り分けと埋め込みに使う。どちらもローカルで動き、課金はない。

```powershell
ollama pull qwen3:4b     # 振り分け
ollama pull bge-m3       # 記憶の意味検索
```

### 5. AivisSpeech（声）

[AivisSpeech](https://aivis-project.com/) を入れて起動する。
`http://127.0.0.1:10101` で待ち受ける。

VOICEVOX を使いたい場合は `config/jarvis.toml` の `engine_url` を
`http://127.0.0.1:50021` に変えるだけでよい。API が同じなのでコードは変わらない。

話者を変えるには、起動中のエンジンの `/speakers` を開いて ID を調べ、
`speaker_id` に入れる。

### 6. 記憶を非公開リポにする

**ここは必ず非公開にすること。** 予定も会話も個人のものなので、
公開されたら取り消せない。

GitHub で `jarvis-data` という **private** リポジトリを作ってから:

```powershell
mkdir $HOME\jarvis-data
cd $HOME\jarvis-data
git init
git remote add origin git@github.com:<あなた>/jarvis-data.git
```

ジャービスは押し出す前に行き先を検査し、公開リポだと分かったら押し出しを止める。

### 7. Google と繋ぐ

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作る
2. 「API とサービス」→ Calendar API / Gmail API / Drive API を有効にする
3. 「認証情報」→ OAuth クライアント ID →**デスクトップアプリ**を作る
4. JSON をダウンロードし、`~/jarvis-data/google/credentials.json` に置く

```powershell
python -m jarvis brief    # 初回はブラウザが開いて許可を求める
```

取る権限は次のとおり。**メールの送信権限は取っていない。**
持ち主の許可なく外へ何かを送る事故は、権限を持たないことで防ぐのがいちばん確実だから。

| 対象 | できること |
|---|---|
| カレンダー | 読み書き |
| Gmail | 読む・下書きを作る（**送信はできない**） |
| ドライブ | 読む |

### 8. 外出先から（任意）

[Discord Developer Portal](https://discord.com/developers/applications) でボットを作り、
`MESSAGE CONTENT INTENT` を有効にして、自分のサーバーに招待する。

```powershell
$env:JARVIS_DISCORD_TOKEN = "ボットのトークン"
```

`config/jarvis.toml` の `[remote]` で `enabled = true` にし、
`owner_user_id` に自分の Discord ユーザー ID を入れる。
**ここを空のままにすると、DM を送れる相手なら誰でも自宅の PC を動かせてしまう。**

---

## 動かす

```powershell
python -m jarvis doctor    # まずこれ。直すべき点が全部出る
python -m jarvis           # 通しで起動
```

「ジャービス」と呼びかけると「はい。」と返る。そのまま用件を言う。

### 部品ごとに確かめる

```powershell
python -m jarvis devices           # マイクとスピーカーの一覧
python -m jarvis say "準備できました"  # 声が出るか
python -m jarvis test-ears         # 聞き取りだけ動かす
python -m jarvis warmup            # 聞き取りモデルを実際に読み込み、CUDA の可否を見る
python -m jarvis ask "今日は何日"     # 頭に投げて応答を見る（声を使わない）
python -m jarvis brief             # 毎朝の読み上げを今すぐ試す
python -m jarvis recall "コーヒー"    # 記憶から思い出せるものを見る
python -m jarvis budget            # Claude を今日何回呼んだか
```

`nvidia-smi` が通っても、faster-whisper が要る cuBLAS / cuDNN の DLL が足りないと
モデルを読み込んだ瞬間に初めて落ちる。`doctor` はそこまで見ていないので、
「`doctor` は緑なのに喋りかけると落ちる」ときは `warmup` を実行して確かめる。

### 自動起動（ログオン時）

```powershell
jarvis\scripts\autostart-install.ps1   # タスクスケジューラに登録する
jarvis\scripts\autostart-remove.ps1    # 解除する
```

登録すると、次回ログオンから `jarvis\scripts\jarvis-start.ps1` が自動で走る。
Ollama と AivisSpeech の起動を確かめ、`doctor` が緑なら `python -m jarvis run` を
始める。ログは `~/jarvis-data/logs/autostart.log` に残る。

### 止める

```powershell
python -m jarvis panic     # すべての操作を即停止
python -m jarvis resume    # 再開できるようにする
```

`Ctrl+Alt+Shift+J` でも同じことが起きる。喋っている最中に「ストップ」と言えば黙る。

---

## PC を操作させる範囲

`config/allowlist.yaml` がすべてを決める。

- `allow` … ここに載っているアプリの中でしか、マウスもキーボードも動かない
- `deny` … `allow` より強い。レジストリエディタなどは触らせない
- `confirm_required` … 送信・購入・削除などは、実行前に声で確認を取る
- `title_deny` … 銀行の画面などでは、許可アプリでも操作を止める

座標でクリックする前に、その場所の部品名を UI Automation で読む。
「送信」ボタンだと分かれば、押す前に確認へ回る。

**ジャービスに `allowlist.yaml` を書き換えさせないこと。** そう CLAUDE.md にも書いてある。
アプリを足したくなったら、自分の手で1行足す。

操作はすべて `action_log` に残る。断ったものも、断った理由と一緒に残る。

```powershell
sqlite3 $HOME\jarvis-data\db\jarvis.db "select ts, tool, decision, reason from action_log order by id desc limit 20"
```

---

## 記憶のしくみ

正本は Markdown。SQLite はそれを速く引くための索引で、消えても作り直せる。

```
~/jarvis-data/
  memory/
    profile.md            人物・好み・制約。頭が毎回まず読む
    projects/<名前>.md     進行中の仕事の状態
    journal/YYYY-MM-DD.md  その日の記録
  db/jarvis.db            索引・会話・操作の記録・呼び出し回数
  screenshots/            操作したときの画面
  logs/jarvis.log         耳・振り分け・頭・口の各段の記録
```

`profile.md` は自分の手で書いてよい。「毎朝6時に起きる」「辛いものが苦手」のように
書いておくと、次の会話から効く。手で直した分は次に思い出すときに自動で取り込まれる
（更新時刻が変わったファイルだけを見るので、増えても遅くならない）。

```powershell
python -m jarvis reindex   # 全部を強制的に読み直す（ふだんは要らない）
python -m jarvis sync      # 非公開リポへ保存する
```

30分ごとに自動でコミットされる（`autocommit_minutes` で変えられる）。

### Obsidian と併用する

記憶は Markdown が正本なので、Obsidian をそのまま重ねられる。ジャービスは声で
書き、Obsidian は目で見て手で直す。同じファイルを別の窓から触るだけで、
どちらかに寄せる必要はない。

**vault に指定するのは `~/jarvis-data/memory` だけ。** `~/jarvis-data` 全体を開くと
`db/`・`logs/`・`screenshots/` まで抱き込む。

`journal/YYYY-MM-DD.md` は Obsidian の日次ノートの既定形式と同じなので、
デイリーノートの保存先を `journal` にすれば、そのまま繋がる。

併用にあたって、ジャービス側は次のように振る舞う。

- `.obsidian/`（設定・プラグイン）と `.trash/`（削除箱）は記憶として取り込まない。
  避けないと、プラグインに付いてくる README を持ち主の記憶として思い出してしまう。
- ノート先頭の YAML frontmatter（`status:` や `tags:`）は本文として取り込まない。
- Obsidian で直したノートは、次に思い出すときに自動で取り込み直される。
  消したノートの断片も一緒に片づく。

**Obsidian Git プラグインは入れないこと。** ジャービスが30分ごとに同じリポジトリを
コミットしているので、二重に走ると互いのコミットを奪い合う。版を残す役はジャービス側に
任せる（押し出し先が公開リポだと止める安全装置も、そちら側にある）。

スマホから読みたい場合、Obsidian Sync は有料（月5ドル前後）で、
このプロジェクトの「運用にお金はかからない」という前提から外れる。
無料で済ませるなら Syncthing などの同期に寄せる。

---

## 新しいものを作らせる

「〜を作って」と言うと、`~/jarvis-workspace/` の下に専用のディレクトリを切って作る。
作業中の状態は `memory/projects/<名前>.md` に残るので、
次の日に「あれの続き」と言えば続きから始まる。

---

## このディレクトリを非公開リポへ移す

いまこのコードは公開リポジトリ（`pomodoro-timer`）の中にある。
自宅 PC を操作する仕組みの設定は、非公開にしておくほうがよい。

```powershell
# GitHub で jarvis という private リポジトリを作ってから
git clone --no-checkout https://github.com/<あなた>/pomodoro-timer.git jarvis-tmp
cd jarvis-tmp
git sparse-checkout set jarvis
git checkout claude/jarvis-assistant-system-5h1208

# 中身だけを新しいリポへ移す
cd ..
mkdir jarvis && cp -r jarvis-tmp/jarvis/* jarvis/
cd jarvis
git init
git remote add origin git@github.com:<あなた>/jarvis.git
git add -A && git commit -m "ジャービスを非公開リポに移す"
git push -u origin main
```

`~/jarvis-data`（記憶）は最初から別の非公開リポなので、そのままでよい。

---

## 困ったとき

`python -m jarvis doctor` がほとんどの原因を名指しする。それでも分からないときは:

| 症状 | 見るところ |
|---|---|
| 呼びかけに反応しない | `wake_threshold` を 0.4 くらいに下げる。`jarvis devices` でマイクを確かめる |
| 聞き取りが遅い | `[ears.stt]` の `device` が `cuda` になっているか。`nvidia-smi` が通るか |
| `doctor` は緑なのに喋りかけると落ちる | `python -m jarvis warmup` を実行する。cuBLAS / cuDNN の DLL が足りないと、モデルを読み込む瞬間に初めて落ちる |
| 声が出ない | AivisSpeech が起動しているか。`jarvis say` で単体で試す |
| 返事が返ってこない | WSL で `tmux attach -t jarvis` して、頭の画面を直に見る |
| 全部 Claude に回る | Ollama が落ちている。`ollama serve` を起動する |
| 操作を断られる | `allowlist.yaml` にそのアプリが載っているか。`action_log` に理由が残っている |
| 記憶が保存されない | `~/jarvis-data` が git リポジトリか。行き先が非公開か |
| 自動起動しない | `~/jarvis-data/logs/autostart.log` を見る。タスクスケジューラに `Jarvis` が登録されているか（`Get-ScheduledTask -TaskName Jarvis`） |
| `WSL ディストロ` で doctor が止まる | `wsl -l -q` で実際の名前を確認し、`config/jarvis.toml` の `[brain] wsl_prefix` をその名前に合わせる |

ログは `~/jarvis-data/logs/jarvis.log` に JSON Lines で残る。
どの段（耳・振り分け・頭・口・手・記憶）で詰まったかが `stage` で分かる。

---

## 開発

```powershell
pytest          # 純粋ロジックのテスト。音も PC も Windows も要らない
```

安全装置（`safety/guard.py`、`mcp/hands.py`）、発話の切れ目（`ears/vad.py`）、
振り分け（`brain/local_skills.py`）、予定の判断（`brain/agenda.py`）は
すべて純粋な関数に切り出してある。ここが緩むと PC が壊れるので、
「動くこと」より「止まること」を厚くテストしてある。
