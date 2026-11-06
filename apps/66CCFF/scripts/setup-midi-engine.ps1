#requires -Version 5.1
# 纯蓝 MIDI 引擎安装脚本（Windows）：Python 3.10 venv + Basic Pitch + ONNX Runtime
# 与 Demucs 的 Python 3.12 引擎完全独立。
# 运行：powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-midi-engine.ps1
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Join-Path $env:APPDATA "MyOutside\apps\66CCFF"
$engine = Join-Path $root "midi-engine"
$venv = Join-Path $engine "venv"
New-Item -ItemType Directory -Force $engine | Out-Null

$uv = (Get-Command uv -ErrorAction SilentlyContinue).Source
if (-not $uv) {
  throw "未找到 uv。请先安装 uv（https://docs.astral.sh/uv/getting-started/installation/），再运行本脚本。"
}

Write-Host "[66CCFF-midi] engine dir: $engine"
Write-Host "[66CCFF-midi] 1/3 安装 Python 3.10 ..."
& $uv python install 3.10
if ($LASTEXITCODE -ne 0) { throw "uv python install 失败（退出码 $LASTEXITCODE）" }

Write-Host "[66CCFF-midi] 2/3 创建独立 venv ..."
& $uv venv $venv --python 3.10 --clear
if ($LASTEXITCODE -ne 0) { throw "uv venv 失败（退出码 $LASTEXITCODE）" }
$py = Join-Path $venv "Scripts\python.exe"

Write-Host "[66CCFF-midi] 3/3 安装 Basic Pitch 与 ONNX Runtime ..."
# Basic Pitch 0.4.0 在 Windows + Python <3.11 上默认用 ONNX Runtime，不装 TensorFlow。
# resampy 仍导入 pkg_resources；uv 创建的 venv 默认没有 setuptools，需要显式装 <81。
& $uv pip install --python $py "basic-pitch==0.4.0" "setuptools<81"
if ($LASTEXITCODE -ne 0) { throw "安装 Basic Pitch 失败（退出码 $LASTEXITCODE）" }

Write-Host "[66CCFF-midi] 自检 ..."
& $py -c "import sys; from importlib.metadata import version; import onnxruntime; from basic_pitch import ICASSP_2022_MODEL_PATH; import os; print('python', sys.version.split()[0]); print('onnxruntime', onnxruntime.__version__); print('basic-pitch', version('basic-pitch')); print('model', ICASSP_2022_MODEL_PATH); print('model_bytes', os.path.getsize(ICASSP_2022_MODEL_PATH))"
if ($LASTEXITCODE -ne 0) { throw "MIDI 引擎自检失败" }

Write-Host "[66CCFF-midi] 完成。现在可以用 transcribe_midi.py 做单轨验证。"
