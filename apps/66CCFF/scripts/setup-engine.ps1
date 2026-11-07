#requires -Version 5.1
# 纯蓝分离引擎安装脚本（Windows）：Python 3.12 venv + BS-RoFormer SW 六轨模型 + CUDA PyTorch
# 运行：powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-engine.ps1
$ErrorActionPreference = "Stop"

$root = Join-Path $env:APPDATA "MyOutside\apps\66CCFF"
$engine = Join-Path $root "roformer-engine"
$venv = Join-Path $engine "venv"
$models = Join-Path $engine "models"
$model = "roformer-model-bs-roformer-sw-by-jarredou"
$modelFile = Join-Path $models "$model\BS-Rofo-SW-Fixed.ckpt"
New-Item -ItemType Directory -Force -Path $engine, $models | Out-Null

$uv = (Get-Command uv -ErrorAction SilentlyContinue).Source
if (-not $uv) {
  throw "未找到 uv。请先安装 uv（https://docs.astral.sh/uv/getting-started/installation/），再运行本脚本。"
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "未找到 ffmpeg。BS-RoFormer 需要先把输入转成 WAV；请安装 ffmpeg 并加入 PATH。"
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "未找到 git。bs-roformer-infer 需要从 Git 仓库安装。"
}

Write-Host "[66CCFF] engine dir: $engine"
Write-Host "[66CCFF] 1/5 安装 Python 3.12 ..."
& $uv python install 3.12
if ($LASTEXITCODE -ne 0) { throw "uv python install 失败（退出码 $LASTEXITCODE）" }

Write-Host "[66CCFF] 2/5 创建 venv ..."
& $uv venv $venv --python 3.12 --clear
if ($LASTEXITCODE -ne 0) { throw "uv venv 失败（退出码 $LASTEXITCODE）" }
$py = Join-Path $venv "Scripts\python.exe"

Write-Host "[66CCFF] 3/5 安装 CUDA PyTorch（首次会下载约数 GB）..."
& $uv pip install --python $py torch torchaudio --index-url https://download.pytorch.org/whl/cu128
if ($LASTEXITCODE -ne 0) { throw "安装 CUDA PyTorch 失败（退出码 $LASTEXITCODE）" }

Write-Host "[66CCFF] 4/5 安装 bs-roformer-infer ..."
& $uv pip install --python $py "bs-roformer-infer @ git+https://github.com/openmirlab/bs-roformer-infer.git@95c8de7b0b091d00f064d694bf916a21866c32f5"
if ($LASTEXITCODE -ne 0) { throw "安装 bs-roformer-infer 失败（退出码 $LASTEXITCODE）" }
# 某些依赖安装过程可能替换 torch；确认最终仍是 CUDA 版
& $uv pip install --python $py --reinstall torch torchaudio --index-url https://download.pytorch.org/whl/cu128
if ($LASTEXITCODE -ne 0) { throw "恢复 CUDA PyTorch 失败（退出码 $LASTEXITCODE）" }

Write-Host "[66CCFF] 5/5 自检并预下载 BS-RoFormer SW 六轨模型（约 667MB）..."
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = "1"
& $py -c "import torch, bs_roformer; print('torch', torch.__version__, 'cuda', torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU only')"
if ($LASTEXITCODE -ne 0) { throw "引擎自检失败" }
& $py -c "import torch; assert torch.cuda.is_available(), 'CUDA 不可用：BS-RoFormer 分离需要本机 GPU'"
if ($LASTEXITCODE -ne 0) { throw "CUDA 不可用" }

$download = Join-Path $venv "Scripts\bs-roformer-download.exe"
& $download --model $model --output-dir $models
if ($LASTEXITCODE -ne 0) { throw "BS-RoFormer SW 模型下载失败（退出码 $LASTEXITCODE）" }
if (-not (Test-Path $modelFile)) { throw "模型文件未找到：$modelFile" }

Write-Host "[66CCFF] 完成。现在可以启动 MyOutside 使用纯蓝。"
