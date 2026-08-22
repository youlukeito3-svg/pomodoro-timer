<#
.SYNOPSIS
    ジャービス本体を起動する。タスクスケジューラの自動起動から呼ばれる。

.DESCRIPTION
    Ollama と AivisSpeech が動いているかを確かめ、動いていなければ
    Ollama は起動を試み、AivisSpeech は手動起動を促す。そのあと
    `python -m jarvis doctor` が緑になっているかを確かめてから
    `python -m jarvis run` を始める。doctor が赤なら、詰まったまま
    黙って再起動を繰り返すよりも、ログに理由を残して止まったほうがいい。
#>
[CmdletBinding()]
param(
    [string]$JarvisDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$logDir = Join-Path $HOME "jarvis-data\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir "autostart.log"

function Write-Log {
    param([string]$Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $logFile -Value $line -Encoding utf8
    Write-Host $line
}

Write-Log "自動起動を試みます"

# --- Ollama ---------------------------------------------------------------
if (-not (Get-Process -Name "ollama" -ErrorAction SilentlyContinue)) {
    Write-Log "Ollama を起動します"
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 5
} else {
    Write-Log "Ollama は起動しています"
}

# --- 音声合成エンジン --------------------------------------------------------
# AivisSpeech と VOICEVOX は API が同じで、どちらを使うかは jarvis.toml の
# engine_url で決まる。導入方法によってプロセス名が変わるので、それらしい
# 名前をいくつか試し、見つからなければ既定の場所から起動を試みる。
# それでも駄目なら止めずに知らせるだけにする（doctor が「口」の警告で拾う）。
$engineNames = @("AivisSpeech-Engine", "AivisSpeech", "VOICEVOX", "run")
if (Get-Process -Name $engineNames -ErrorAction SilentlyContinue) {
    Write-Log "音声合成エンジンは起動しています"
} else {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\VOICEVOX\VOICEVOX.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\AivisSpeech\AivisSpeech.exe")
    )
    $engine = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($engine) {
        Write-Log "音声合成エンジンを起動します: $engine"
        Start-Process $engine
        Start-Sleep -Seconds 20   # エンジンが待ち受けを始めるまで待つ
    } else {
        Write-Log "!! 音声合成エンジンが見つかりません。手動で起動してください。声が出ません。"
    }
}

# --- 本体 -------------------------------------------------------------------
Push-Location $JarvisDir
try {
    $py = ".\.venv\Scripts\python.exe"
    if (-not (Test-Path $py)) {
        Write-Log "!! $py がありません。setup-windows.ps1 を先に実行してください。"
        exit 1
    }

    & $py -m jarvis doctor
    if ($LASTEXITCODE -ne 0) {
        Write-Log "!! doctor が問題ありと判定しました。起動を中止します。詳細は上のログを見てください。"
        exit 1
    }
    Write-Log "doctor は問題なし。起動します"
    & $py -m jarvis run
    Write-Log "終了しました（終了コード $LASTEXITCODE）"
} finally {
    Pop-Location
}
