# 66CCFF-0008 六轨分离引擎：BS-RoFormer SW 6-stem，本机 CUDA

- 状态：有效
- 日期：2026-11-07
- 决策者：作者
- 服务于：
  - 作者预期：[`../README.md`](../README.md)「核心流程与预期」六轨（含钢琴）、本机 GPU
  - 上游决策：[66CCFF-0001](66CCFF-0001-six-stem-engine.md)（旧 Demucs 引擎，已弃用）、[66CCFF-0003](66CCFF-0003-engine-setup-script.md)（仓库脚本安装）

## 背景

旧的六轨引擎是 Demucs v4 `htdemucs_6s`。作者试听 BS-RoFormer SW 6-stem 的输出后确认：**分六轨的效果明显好于旧引擎**，因此可以明确弃用旧模型。选择以实际听感为准，而不是只看 SDR 或音符数量。

BS-RoFormer SW 6-stem 使用 `BS-Rofo-SW-Fixed.ckpt`，输出 bass / drums / other / vocals / guitar / piano 六轨；本机 RTX 5060 处理 3 分 02 秒歌曲约 36 秒。

## 决策

- 使用 **BS-RoFormer SW 6-stem**（`BS-Rofo-SW-Fixed.ckpt`）作为六轨分离引擎；
- 用 `bs-roformer-infer` 推理，Python 3.12 + CUDA 12.8 PyTorch，使用本机 GPU；
- 引擎目录为 `<userData>/apps/66CCFF/roformer-engine`，模型放在其 `models/` 下；安装脚本为 `apps/66CCFF/scripts/setup-engine.ps1`；
- 分离前用 `ffmpeg` 把输入转成 44.1kHz 立体声 WAV（推理工具只接受 WAV）；输出六条 16-bit FLAC；
- 旧的 Demucs `htdemucs_6s` 不再出现在运行路径中；已分离的旧结果不做迁移，需要时重新分离；
- MIDI 转写本次不更换，继续使用 Basic Pitch；作者反馈效果仍然一般，后续另行评估其它转 MIDI 技术。

## 考虑过、没有采用

- **继续使用 `htdemucs_6s`**：六轨能用，但作者试听后确认明显不如新引擎，尤其不再满足钢琴练习需求。
- **SCNet / 两阶段级联**：仍是备选研究路线，但当前 BS-RoFormer SW 的六轨结果已经达到作者要求，不必先增加复杂度。
- **CPU 推理**：BS-RoFormer 在 CPU 上会很慢；当前目标是本机 GPU，不启用 CPU 回退。

## 代价

- 首次安装需要下载 CUDA PyTorch 与约 667MB 的模型；
- 权重许可证未明确（代码 MIT 不等于权重可分发）；如果将来分发应用，必须先确认权重许可；
- 推理依赖 CUDA GPU 和系统 `ffmpeg`；没有 GPU 时分离会失败；
- 旧的分轨结果仍是旧模型的输出；要获得新效果必须重新分离。

## 什么时候应该重新考虑

- 出现听感明显更好的六轨模型，或当前权重许可证无法满足分发需求；
- 需要 CPU / ONNX / 浏览器端部署；
- BS-RoFormer SW 的显存、耗时或稳定性成为问题。
