#!/usr/bin/env bash
# 纯蓝分离引擎安装脚本（macOS）：Python 3.12 + PyTorch CPU + BS-RoFormer SW 六轨模型
# 运行：bash apps/66CCFF/scripts/setup-engine-macos.sh
#
# macOS 没有 CUDA，且 bs-roformer-infer 已移除 MPS；分离会走 CPU，速度明显慢于 NVIDIA GPU。
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[66CCFF] 这个脚本只用于 macOS。" >&2
  exit 1
fi

root="$HOME/Library/Application Support/MyOutside/apps/66CCFF"
engine="$root/roformer-engine"
venv="$engine/venv"
models="$engine/models"
model="roformer-model-bs-roformer-sw-by-jarredou"
model_file="$models/$model/BS-Rofo-SW-Fixed.ckpt"
mkdir -p "$engine" "$models"

for tool in uv ffmpeg ffprobe git; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[66CCFF] 未找到 $tool。请先安装：" >&2
    echo "  brew install uv ffmpeg git" >&2
    echo "（uv 也可以用 https://docs.astral.sh/uv/getting-started/installation/ 的安装方式）" >&2
    exit 1
  fi
done

echo "[66CCFF] engine dir: $engine"
echo "[66CCFF] 1/5 安装 Python 3.12 ..."
uv python install 3.12

echo "[66CCFF] 2/5 创建 venv ..."
uv venv "$venv" --python 3.12 --clear
py="$venv/bin/python"

echo "[66CCFF] 3/5 安装 CPU 版 PyTorch（首次会下载约数 GB）..."
uv pip install --python "$py" torch

echo "[66CCFF] 4/5 安装 bs-roformer-infer ..."
uv pip install --python "$py" \
  "bs-roformer-infer @ git+https://github.com/openmirlab/bs-roformer-infer.git@95c8de7b0b091d00f064d694bf916a21866c32f5"

echo "[66CCFF] 5/5 自检并预下载 BS-RoFormer SW 六轨模型（约 667MB）..."
"$py" -c "import torch, bs_roformer; print('torch', torch.__version__)"

download="$venv/bin/bs-roformer-download"
"$download" --model "$model" --output-dir "$models"
test -f "$model_file"

echo "[66CCFF] 完成。现在可以启动 MyOutside 使用纯蓝（macOS 分离走 CPU）。"
