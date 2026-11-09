#!/usr/bin/env bash
# 纯蓝转 MIDI 引擎安装脚本（macOS）：Python 3.12 venv + MuScriptor 0.4.0（66CCFF-0012）
# 运行：bash apps/66CCFF/scripts/setup-muscriptor-macos.sh
#
# Apple Silicon 上 MuScriptor 自动用 Metal（MPS）。权重（CC BY-NC 4.0，非商用）要先登录 HuggingFace 才能下载：
# 脚本最后会提示登录命令；token 只在终端里输入。
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[66CCFF] 这个脚本只用于 macOS。" >&2
  exit 1
fi

engine="$HOME/Library/Application Support/MyOutside/apps/66CCFF/muscriptor-engine"
venv="$engine/venv"
models="$engine/models"
mkdir -p "$engine" "$models"

for tool in uv ffmpeg; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[66CCFF] 未找到 $tool。请先安装：brew install uv ffmpeg" >&2
    exit 1
  fi
done

echo "[66CCFF] engine dir: $engine"
echo "[66CCFF] 1/4 安装 Python 3.12 ..."
uv python install 3.12

echo "[66CCFF] 2/4 创建 venv ..."
uv venv "$venv" --python 3.12 --clear
py="$venv/bin/python"

echo "[66CCFF] 3/4 安装 MuScriptor 0.4.0（含 PyTorch）..."
uv pip install --python "$py" "muscriptor==0.4.0"
"$py" -c "import torch, muscriptor; print('torch', torch.__version__, 'mps', torch.backends.mps.is_available())"

echo "[66CCFF] 4/4 预下载 medium 权重（约 1.2GB；需要已登录 HuggingFace）..."
if HF_HUB_CACHE="$models" "$venv/bin/hf" auth whoami >/dev/null 2>&1; then
  HF_HUB_CACHE="$models" "$venv/bin/hf" download MuScriptor/muscriptor-medium
else
  echo "[66CCFF] 还没登录 HuggingFace，先跳过下载。"
  echo "  1. 浏览器打开 https://huggingface.co/MuScriptor/muscriptor-medium ，登录后接受许可（CC BY-NC 4.0）；"
  echo "  2. 终端运行：\"$venv/bin/hf\" auth login ，按提示粘贴 token；"
  echo "  之后第一次转 MIDI 会自动下载权重。"
fi

echo "[66CCFF] 完成。"
