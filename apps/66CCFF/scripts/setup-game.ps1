#requires -Version 5.1
# 纯蓝人声转 MIDI 引擎安装脚本（Windows）：Python 3.12 venv + GAME v1.0.3 + GAME-1.0 large 权重 + beat_this + CUDA PyTorch（66CCFF-0017）
# 运行：powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-game.ps1
#
# GAME 的代码是 MIT，预训练权重是 CC BY-NC-SA 4.0（非商用）。
# 已经装过的部分（代码、权重）会跳过；权重约 350MB，下载中断后重新运行会接着下。
$ErrorActionPreference = "Stop"

$gameTag = "v1.0.3"
$modelName = "GAME-1.0-large"
$modelUrl = "https://github.com/openvpi/GAME/releases/download/v1.0.0/$modelName.zip"

$engine = Join-Path $env:APPDATA "MyOutside\apps\66CCFF\game-engine"
$venv = Join-Path $engine "venv"
$code = Join-Path $engine "GAME"
$models = Join-Path $engine "models"
New-Item -ItemType Directory -Force -Path $engine, $models | Out-Null

$uv = (Get-Command uv -ErrorAction SilentlyContinue).Source
if (-not $uv) {
  throw "未找到 uv。请先安装 uv（https://docs.astral.sh/uv/getting-started/installation/），再运行本脚本。"
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "未找到 ffmpeg。转 MIDI 时混合多条轨要用它；请安装 ffmpeg 并加入 PATH。"
}
$curl = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
$tar = (Get-Command tar.exe -ErrorAction SilentlyContinue).Source
if (-not $curl -or -not $tar) {
  throw "未找到 curl.exe 或 tar.exe（Windows 10 1803 以后自带）。"
}

Write-Host "[66CCFF] engine dir: $engine"
Write-Host "[66CCFF] 1/5 安装 Python 3.12 ..."
& $uv python install 3.12
if ($LASTEXITCODE -ne 0) { throw "uv python install 失败（退出码 $LASTEXITCODE）" }

Write-Host "[66CCFF] 2/5 创建 venv ..."
& $uv venv $venv --python 3.12 --clear
if ($LASTEXITCODE -ne 0) { throw "uv venv 失败（退出码 $LASTEXITCODE）" }
$py = Join-Path $venv "Scripts\python.exe"

Write-Host "[66CCFF] 3/5 下载 GAME $gameTag 的代码 ..."
if (-not (Test-Path (Join-Path $code "infer.py"))) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("game-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $archive = Join-Path $tmp "game.tar.gz"
  & $curl -fL --retry 5 -o $archive "https://github.com/openvpi/GAME/archive/refs/tags/$gameTag.tar.gz"
  if ($LASTEXITCODE -ne 0) { throw "下载 GAME 代码失败（退出码 $LASTEXITCODE）" }
  & $tar -xzf $archive -C $tmp
  if ($LASTEXITCODE -ne 0) { throw "解压 GAME 代码失败（退出码 $LASTEXITCODE）" }
  if (Test-Path $code) { Remove-Item -Recurse -Force $code }
  Move-Item (Join-Path $tmp ("GAME-" + $gameTag.TrimStart("v"))) $code
  Remove-Item -Recurse -Force $tmp
} else {
  Write-Host "[66CCFF] 已有，跳过。"
}

Write-Host "[66CCFF] 4/5 安装依赖（CUDA PyTorch、GAME 的依赖、beat_this；首次会下载约数 GB）..."
& $uv pip install --python $py --torch-backend cu128 torch -r (Join-Path $code "requirements.txt") "beat-this>=1.1"
if ($LASTEXITCODE -ne 0) { throw "安装依赖失败（退出码 $LASTEXITCODE）" }
& $py -c "import torch, lightning, beat_this; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"
if ($LASTEXITCODE -ne 0) { throw "引擎自检失败" }

Write-Host "[66CCFF] 5/5 下载权重 $modelName（约 350MB，CC BY-NC-SA 4.0）和节拍模型 ..."
if (-not (Test-Path (Join-Path $models "$modelName\model.pt"))) {
  $zip = Join-Path $models "$modelName.zip"
  & $curl -fL --retry 5 -C - -o $zip $modelUrl
  if ($LASTEXITCODE -ne 0) { throw "权重下载失败（退出码 $LASTEXITCODE）；重新运行会接着下" }
  Expand-Archive -Force -Path $zip -DestinationPath $models
  Remove-Item -Force $zip
} else {
  Write-Host "[66CCFF] 权重已有，跳过。"
}
# beat_this 的权重（约 80MB）放在 PyTorch 的缓存里，和 MuScriptor 共用
& $py -c "from beat_this.inference import load_checkpoint; load_checkpoint('final0')"
if ($LASTEXITCODE -ne 0) { throw "节拍模型下载失败（退出码 $LASTEXITCODE）" }

Write-Host "[66CCFF] 完成。"
