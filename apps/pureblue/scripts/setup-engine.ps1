#requires -Version 5.1
# 纯蓝引擎安装脚本（Windows）：Python 3.12 venv + Demucs + CUDA PyTorch + 六轨模型
# 运行：powershell -ExecutionPolicy Bypass -File apps/pureblue/scripts/setup-engine.ps1
$ErrorActionPreference = "Stop"

$root = Join-Path $env:APPDATA "MyOutside\apps\pureblue"
$engine = Join-Path $root "engine"
$venv = Join-Path $engine "venv"
New-Item -ItemType Directory -Force $engine | Out-Null

$uv = (Get-Command uv -ErrorAction SilentlyContinue).Source
if (-not $uv) {
  throw "未找到 uv。请先安装 uv（https://docs.astral.sh/uv/getting-started/installation/），再运行本脚本。"
}

Write-Host "[pureblue] engine dir: $engine"
Write-Host "[pureblue] 1/4 安装 Python 3.12 ..."
& $uv python install 3.12
if ($LASTEXITCODE -ne 0) { throw "uv python install 失败（退出码 $LASTEXITCODE）" }

Write-Host "[pureblue] 2/4 创建 venv ..."
& $uv venv $venv --python 3.12 --clear
if ($LASTEXITCODE -ne 0) { throw "uv venv 失败（退出码 $LASTEXITCODE）" }
$py = Join-Path $venv "Scripts\python.exe"

Write-Host "[pureblue] 3/4 安装 Demucs 与 CUDA PyTorch（首次会下载约数 GB）..."
& $uv pip install --python $py demucs lameenc
if ($LASTEXITCODE -ne 0) { throw "安装 demucs 失败（退出码 $LASTEXITCODE）" }
& $uv pip install --python $py --reinstall torch torchaudio --index-url https://download.pytorch.org/whl/cu128
if ($LASTEXITCODE -ne 0) { throw "安装 CUDA PyTorch 失败（退出码 $LASTEXITCODE）" }
# CUDA 版重装可能清理掉 numpy；demucs 需要它，显式补回
& $uv pip install --python $py numpy
if ($LASTEXITCODE -ne 0) { throw "安装 numpy 失败（退出码 $LASTEXITCODE）" }

Write-Host "[pureblue] 4/4 自检并预下载六轨模型（模型走 HuggingFace 缓存，可复用）..."
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = "1"
& $py -c "import numpy, torch, demucs; print('torch', torch.__version__, 'cuda', torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU only')"
if ($LASTEXITCODE -ne 0) { throw "引擎自检失败" }
& $py -c "from demucs.pretrained import get_model; m = get_model('htdemucs_6s'); print('model sources:', m.sources)"
if ($LASTEXITCODE -ne 0) { throw "六轨模型下载失败" }

Write-Host "[pureblue] 完成。现在可以启动 MyOutside 使用纯蓝。"
