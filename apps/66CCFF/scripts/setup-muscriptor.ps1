#requires -Version 5.1
# 纯蓝转 MIDI 引擎安装脚本（Windows）：Python 3.12 venv + MuScriptor 0.4.0 + CUDA PyTorch（66CCFF-0012）
# 运行：powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-muscriptor.ps1
#
# 权重（CC BY-NC 4.0，非商用）要先登录 HuggingFace 才能下载：脚本最后会提示登录命令；token 只在终端里输入。
$ErrorActionPreference = "Stop"

$engine = Join-Path $env:APPDATA "MyOutside\apps\66CCFF\muscriptor-engine"
$venv = Join-Path $engine "venv"
$models = Join-Path $engine "models"
New-Item -ItemType Directory -Force -Path $engine, $models | Out-Null

$uv = (Get-Command uv -ErrorAction SilentlyContinue).Source
if (-not $uv) {
  throw "未找到 uv。请先安装 uv（https://docs.astral.sh/uv/getting-started/installation/），再运行本脚本。"
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "未找到 ffmpeg。转 MIDI 时混合多条轨要用它；请安装 ffmpeg 并加入 PATH。"
}

Write-Host "[66CCFF] engine dir: $engine"
Write-Host "[66CCFF] 1/4 安装 Python 3.12 ..."
& $uv python install 3.12
if ($LASTEXITCODE -ne 0) { throw "uv python install 失败（退出码 $LASTEXITCODE）" }

Write-Host "[66CCFF] 2/4 创建 venv ..."
& $uv venv $venv --python 3.12 --clear
if ($LASTEXITCODE -ne 0) { throw "uv venv 失败（退出码 $LASTEXITCODE）" }
$py = Join-Path $venv "Scripts\python.exe"
$hf = Join-Path $venv "Scripts\hf.exe"

Write-Host "[66CCFF] 3/4 安装 MuScriptor 0.4.0（CUDA PyTorch，首次会下载约数 GB）..."
& $uv pip install --python $py --torch-backend cu128 "muscriptor==0.4.0"
if ($LASTEXITCODE -ne 0) { throw "安装 MuScriptor 失败（退出码 $LASTEXITCODE）" }
& $py -c "import torch, muscriptor; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"
if ($LASTEXITCODE -ne 0) { throw "引擎自检失败" }

Write-Host "[66CCFF] 4/4 预下载 medium 权重（约 1.2GB；需要已登录 HuggingFace）..."
$env:HF_HUB_CACHE = $models
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = "1"
& $hf auth whoami *> $null
if ($LASTEXITCODE -eq 0) {
  & $hf download MuScriptor/muscriptor-medium
  if ($LASTEXITCODE -ne 0) { throw "权重下载失败（退出码 $LASTEXITCODE）" }
} else {
  Write-Host "[66CCFF] 还没登录 HuggingFace，先跳过下载。"
  Write-Host "  1. 浏览器打开 https://huggingface.co/MuScriptor/muscriptor-medium ，登录后接受许可（CC BY-NC 4.0）；"
  Write-Host "  2. 终端运行：& `"$hf`" auth login ，按提示粘贴 token；"
  Write-Host "  之后第一次转 MIDI 会自动下载权重。"
}

Write-Host "[66CCFF] 完成。"
