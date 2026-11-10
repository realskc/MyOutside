#!/usr/bin/env bash
# 纯蓝人声转 MIDI 引擎安装脚本（macOS）：Python 3.12 venv + GAME v1.0.3 + GAME-1.0 large 权重 + beat_this（66CCFF-0017）
# 运行：bash apps/66CCFF/scripts/setup-game-macos.sh
#
# GAME 的代码是 MIT，预训练权重是 CC BY-NC-SA 4.0（非商用）。Apple Silicon 上自动用 Metal（MPS）。
# 已经装过的部分（代码、权重）会跳过；权重约 350MB，下载中断后重新运行会接着下。
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[66CCFF] 这个脚本只用于 macOS。" >&2
  exit 1
fi

GAME_TAG="v1.0.3"
MODEL_NAME="GAME-1.0-large"
MODEL_URL="https://github.com/openvpi/GAME/releases/download/v1.0.0/$MODEL_NAME.zip"

engine="$HOME/Library/Application Support/MyOutside/apps/66CCFF/game-engine"
venv="$engine/venv"
code="$engine/GAME"
models="$engine/models"
mkdir -p "$engine" "$models"

for tool in uv ffmpeg curl tar unzip; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[66CCFF] 未找到 ${tool}。uv / ffmpeg 可以用 brew install uv ffmpeg 安装。" >&2
    exit 1
  fi
done

echo "[66CCFF] engine dir: $engine"
echo "[66CCFF] 1/5 安装 Python 3.12 ..."
uv python install 3.12

echo "[66CCFF] 2/5 创建 venv ..."
uv venv "$venv" --python 3.12 --clear
py="$venv/bin/python"

echo "[66CCFF] 3/5 下载 GAME ${GAME_TAG} 的代码 ..."
if [[ ! -f "$code/infer.py" ]]; then
  tmp="$(mktemp -d)"
  curl -fL --retry 5 -o "$tmp/game.tar.gz" "https://github.com/openvpi/GAME/archive/refs/tags/$GAME_TAG.tar.gz"
  tar -xzf "$tmp/game.tar.gz" -C "$tmp"
  rm -rf "$code"
  mv "$tmp/GAME-${GAME_TAG#v}" "$code"
  rm -rf "$tmp"
else
  echo "[66CCFF] 已有，跳过。"
fi

echo "[66CCFF] 4/5 安装依赖（PyTorch、GAME 的依赖、beat_this）..."
uv pip install --python "$py" torch -r "$code/requirements.txt" "beat-this>=1.1"
"$py" -c "import torch, lightning, beat_this; print('torch', torch.__version__, 'mps', torch.backends.mps.is_available())"

echo "[66CCFF] 5/5 下载权重 ${MODEL_NAME}（约 350MB，CC BY-NC-SA 4.0）和节拍模型 ..."
if [[ ! -f "$models/$MODEL_NAME/model.pt" ]]; then
  curl -fL --retry 5 -C - -o "$models/$MODEL_NAME.zip" "$MODEL_URL"
  unzip -q -o "$models/$MODEL_NAME.zip" -d "$models"
  rm -f "$models/$MODEL_NAME.zip"
else
  echo "[66CCFF] 权重已有，跳过。"
fi
# beat_this 的权重（约 80MB）放在 PyTorch 的缓存里，和 MuScriptor 共用
"$py" -c "from beat_this.inference import load_checkpoint; load_checkpoint('final0')"

echo "[66CCFF] 完成。"
