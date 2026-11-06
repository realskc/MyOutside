# 66CCFF-0001 六轨分离引擎：Demucs v4 `htdemucs_6s`，本地 CUDA

- 状态：有效
- 日期：2026-11-04
- 决策者：agent
- 服务于：
  - 作者预期：[`../README.md`](../README.md)「核心流程与预期」六轨（含钢琴）、本机 GPU
  - 上游决策：无（应用专属）

## 背景

作者需要六轨分离（人声 / 鼓 / 贝斯 / 其他 / 吉他 / 钢琴），并希望使用本机 GPU。UVR5 只是作者当前使用的工具；它没有面向用户的命令行，仓库内的 `separate.py` 与 GUI 常量、模型元数据耦合，不适合作为自动化接口。Demucs v4 的 `htdemucs_6s` 正好输出这六轨，且可以通过 Python 命令行无头运行。

## 决策

- 使用 Demucs v4 `htdemucs_6s`（`python -m demucs --name htdemucs_6s`）作为首版分离引擎；
- 引擎运行在应用管理的 Python 3.12 venv 中；PyTorch 使用 CUDA 12.8 轮子；模型走 HuggingFace 缓存（默认为用户目录，可复用）；
- 输出 192 kbps MP3 的六轨，兼顾体积与听感。

## 考虑过、没有采用

- **自动化 UVR5 GUI**：版本 / 语言 / DPI 变化即失效，占用鼠标，跨平台困难。
- **直接调用 UVR5 `separate.py`**：依赖 GUI 常量与模型元数据，不是稳定 CLI。
- **两轨模型**：作者明确要六轨（含钢琴）。

## 代价

- 首次安装需要下载 PyTorch（约数 GB）与模型；首版只提供 Windows 安装脚本。
- Demucs 的分离质量与 UVR5 的特定模型不完全相同；作者试用后可替换。

## 什么时候应该重新考虑

- 作者对六轨质量不满意，或需要 UVR5 的特定模型；
- 需要 macOS / Linux 的一键安装（补脚本）；
- 迁移到更轻量的推理方案（如 ONNX）。
