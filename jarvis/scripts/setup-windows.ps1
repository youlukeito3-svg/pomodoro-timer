<#
.SYNOPSIS
    ジャービス: Windows 側のセットアップ。

.DESCRIPTION
    Python・Ollama・venv・依存パッケージ・Ollama モデル・WSL2 ミラーモード・
    記憶/作業ディレクトリの雛形を用意する。config の書き換えや判断の要ることは
    PC 側の Claude Code（jarvis/CLAUDE.md の指示）にやらせる。
#>
[CmdletBinding()]
param(
    [string]$JarvisDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

Write-Host "== ジャービス: Windows 側のセットアップ =="
Write-Host ""

# --- 1. Python -----------------------------------------------------------
if (Get-Command py -ErrorAction SilentlyContinue) {
    Write-Host "-- Python は入っています ($(py -3.12 --version 2>&1))"
} else {
    Write-Host "-- Python 3.12 を入れます"
    winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
}

# --- 2. Ollama -------------------------------------------------------------
if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Write-Host "-- Ollama は入っています"
} else {
    Write-Host "-- Ollama を入れます"
    winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
}

# --- 3. venv と依存関係 ------------------------------------------------------
Push-Location $JarvisDir
try {
    if (-not (Test-Path ".venv")) {
        Write-Host "-- 仮想環境を作ります"
        py -3.12 -m venv .venv
    } else {
        Write-Host "-- 仮想環境は既にあります"
    }
    $py = ".\.venv\Scripts\python.exe"
    Write-Host "-- 依存関係を入れます（時間がかかります）"
    & $py -m pip install --upgrade pip
    & $py -m pip install -e ".[ears,mouth,hands,memory,google,remote,dev]"
    if ($LASTEXITCODE -ne 0) {
        throw "pip install が失敗しました（終了コード $LASTEXITCODE）"
    }
} finally {
    Pop-Location
}

# --- 4. Ollama のモデル ------------------------------------------------------
Write-Host "-- Ollama のモデルを取得します（初回は時間がかかります）"
ollama pull qwen3:4b
ollama pull bge-m3

# --- 5. WSL2 をミラーモードに ------------------------------------------------
$wslConfigPath = Join-Path $HOME ".wslconfig"
$mirrorLine = "networkingMode=mirrored"
$content = if (Test-Path $wslConfigPath) { Get-Content $wslConfigPath -Raw } else { "" }

if ($content -match [regex]::Escape($mirrorLine)) {
    Write-Host "-- .wslconfig は既にミラーモードです"
} else {
    Write-Host "-- .wslconfig にミラーモードを追加します"
    if ($content -notmatch "(?m)^\[wsl2\]") {
        Add-Content -Path $wslConfigPath -Value "`n[wsl2]`n$mirrorLine" -Encoding utf8
    } else {
        Add-Content -Path $wslConfigPath -Value $mirrorLine -Encoding utf8
    }
    Write-Host "-- 設定を効かせるため wsl --shutdown を実行します"
    wsl --shutdown
}

# --- 6. ディレクトリの雛形 ----------------------------------------------------
foreach ($dir in @((Join-Path $HOME "jarvis-data"), (Join-Path $HOME "jarvis-workspace"))) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "-- $dir を作りました"
    } else {
        Write-Host "-- $dir は既にあります"
    }
}

Write-Host ""
Write-Host "== Windows 側のセットアップは完了です =="
Write-Host "残り: AivisSpeech の導入・起動、jarvis-data の非公開リポ化、Google 連携。"
Write-Host "jarvis/README.md の該当節、または jarvis/CLAUDE.md の指示に従ってください。"
Write-Host "終わったら: cd $JarvisDir; .\.venv\Scripts\python.exe -m jarvis doctor"
