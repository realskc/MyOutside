# VocalParse

- 最近核对：2026-11-10
- 代码：[pymaster17/VocalParse](https://github.com/pymaster17/VocalParse)；模型：[pymaster/VocalParse](https://huggingface.co/pymaster/VocalParse)（Apache-2.0）；论文：[arXiv:2605.04613](https://arxiv.org/abs/2605.04613)（2026-05）

## 是什么

用音频大模型（在 Qwen3-ASR-1.7B 上微调）做的**歌声转写**：一次输出歌词、音高、音符时值和整首 BPM。

## 已核实的事实

- 论文称在 Opencpop 等数据集上达到最好的歌声转写表现；只给音频时接近 ROSVOT（论文）。
- 主要用普通话歌声训练；模型卡写明这个 checkpoint 不预测实际的音符时长；超过 30 秒的音频要先切段（模型卡）。
- 约 2B 参数，BF16。
