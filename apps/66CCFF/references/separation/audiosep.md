# AudioSep

- 最近核对：2026-11-07
- 代码：[Audio-AGI/AudioSep](https://github.com/Audio-AGI/AudioSep)（MIT）
- 论文：*Separate Anything You Describe*（[arXiv:2308.05037](https://arxiv.org/abs/2308.05037)）

## 是什么

Open-domain 音频分离基础模型，支持自然语言 query 和音频 query；官方示例包括音乐乐器分离。

## 官方事实

- 官方 README 写明模型使用 **32kHz** 采样率；输入输出都是 32kHz。
- 可用文本描述提取目标，例如乐器名称、音色描述。
- 支持 chunk-based inference 以降低显存。
- 提供 Hugging Face checkpoint（`nielsr/audiosep-demo`）和官方 checkpoint 下载。
- 评测覆盖 music、AudioSet、ESC-50、AudioCaps 等；音乐数据集 SDRi 约 10.5（不同任务口径不同）。

## 与纯蓝的关系

可作为「用文字/参考音频提取吉他或钢琴」的实验路线；32kHz 对 MIDI 基频/瞬态可能够用，但不适合作为高保真混音导出。

## 待核实

- 对具体吉他/钢琴音色的实际效果；
- 权重许可证（代码 MIT 不等于权重可分发）；
- 32kHz 输出对 Basic Pitch / Transkun 的影响；
- 显存和推理时间。
