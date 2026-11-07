# YourMT3+

- 最近核对：2026-11-07
- 代码：[mimbres/YourMT3](https://github.com/mimbres/YourMT3)（GPL-3.0）
- 论文：YourMT3+（MLSP 2024，[arXiv:2407.04822](https://arxiv.org/abs/2407.04822)）

## 是什么

多任务、多轨音乐转录系统，目标是把音频直接转成带乐器标签的多轨 MIDI；它不是音频分轨模型。

## 官方事实

- 仓库自称「multi-task and multi-track music transcription」。
- YourMT3+ 是 2024 年的后续版本，提供 Hugging Face Space 和预发布代码。
- 支持多种乐器/任务（具体输出类别以当前代码和 checkpoint 为准）。
- 许可证 GPL-3.0。

## 与纯蓝的关系

如果 `Other` 或 `Instrumental` 已经足够干净，可以尝试跳过吉他/钢琴 WAV 分离，直接让 YourMT3+ 输出多轨 MIDI。优势是避免二次音频分离带来的相位/瞬态损失；风险是转录模型对混音中的串音和混响也很敏感。

## 待核实

- 实际输出是否包含钢琴、木吉他、电吉他、弦乐等独立轨道；
- 对 Demucs/SCNet 分轨伪影的鲁棒性；
- 本机显存/速度；
- GPL-3.0 对应用分发的影响；
- 「cross-channel attention」等架构说法需要以论文/代码为准。
