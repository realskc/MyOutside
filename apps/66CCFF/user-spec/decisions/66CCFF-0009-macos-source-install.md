# 66CCFF-0009 macOS 源码安装：分离走 CPU

- 状态：有效（代码和安装脚本已补；待在实际 Mac 上验证）
- 日期：2026-11-07
- 决策者：作者
- 服务于：
  - 作者预期：[`../README.md`](../README.md)「工具与平台」支持 macOS
  - 上游决策：[66CCFF-0008](66CCFF-0008-bs-roformer-engine.md)（BS-RoFormer SW 引擎）、[66CCFF-0003](66CCFF-0003-engine-setup-script.md)（仓库脚本安装）

## 背景

目标不是给普通 Mac 用户一个打包好的应用，而是：**别人 clone 仓库后，在 Mac 上按 agent 的步骤装好，就能用 `pnpm dev` 启动并使用纯蓝**。

Mac 没有 NVIDIA CUDA；`bs-roformer-infer` 也已经明确移除 MPS，所以不能用 Apple GPU 跑当前引擎。PyTorch 的 macOS CPU 后端可以运行同一个 BS-RoFormer SW 模型，只是会明显比 RTX 5060 慢。

## 决策

- 增加 `apps/66CCFF/scripts/setup-engine-macos.sh`：
  - 安装 Python 3.12 / CPU 版 PyTorch / `bs-roformer-infer`；
  - 预下载 BS-RoFormer SW 六轨模型到 `~/Library/Application Support/MyOutside/apps/66CCFF/roformer-engine/models`；
  - 依赖 `uv`、`ffmpeg`、`ffprobe`、`git`。
- 分离设备按平台选择：Windows 默认 `cuda`，macOS 默认 `cpu`；可用 `MYOUTSIDE_SEPARATION_DEVICE` 覆盖。
- `ffmpeg` / `ffprobe` 优先用 `FFMPEG_PATH` / `FFPROBE_PATH`，其次查 PATH，并在 macOS 补查 Homebrew / MacPorts 常见目录。
- 不做 Mac 应用打包 / 签名；通过源码运行宿主。
- MIDI 安装脚本本次仍只覆盖 Windows；Mac 的 Basic Pitch 环境后续再补。

## 考虑过、没有采用

- **MPS**：`bs-roformer-infer` 不再支持 MPS，当前不试图绕开它的限制。
- **CoreML / ONNX 转换**：可能改善 Mac 性能，但需要额外的模型转换和验证，先不引入。
- **Mac 打包分发**：不是目标；源码安装即可。

## 代价

- Mac 上只能 CPU 推理，耗时会明显高于 GPU；具体性能需要在目标 Mac 上实测。
- 首次安装需要下载 PyTorch 和约 667MB 的模型；磁盘和内存占用不小。
- 当前没有 Mac 实机验证，安装脚本先按标准 macOS + Apple Silicon / Intel 的 Python/PyTorch 路径编写。

## 什么时候应该重新考虑

- 实际 Mac 上的 CPU 分离速度不可接受 → 评估 CoreML / ONNX / 更轻模型；
- 需要在 Mac 上使用 MIDI 转写 → 补 Basic Pitch 的 macOS 安装脚本；
- 需要分发给普通 Mac 用户 → 再考虑打包、签名和公证。
