# YourMT3+

- 最近核对：2026-11-07
- 代码：[mimbres/YourMT3](https://github.com/mimbres/YourMT3)（GPL-3.0）
- 论文：YourMT3+（MLSP 2024，[arXiv:2407.04822](https://arxiv.org/abs/2407.04822)）

## 是什么

多任务、多轨音乐转录系统，目标是把音频直接转成带乐器标签的多轨 MIDI；它不是音频分轨模型。

## 官方事实

- 仓库自称「multi-task and multi-track music transcription」。
- YourMT3+ 是 2024 年的后续版本（MLSP 2024，arXiv:2407.04822）；默认/常用变体是 `YPTF.MoE+Multi (noPS)`。
- `mt3-infer` 记录 YourMT3 权重约 **536MB**，并称其支持 8-stem separation（多轨 MIDI，不是音频分轨）。
- 论文/README 提到 PerceiverTF、MoE、跨数据集 stem augmentation；Gemini 说的「cross-channel attention」需要用论文/代码进一步确认，当前不作为已验证事实。
- 许可证存在不一致：GitHub 仓库标 **GPL-3.0**，HuggingFace 权重标 **Apache-2.0**；分发前必须核对。

## 与纯蓝的关系

如果 `Other` 或 `Instrumental` 已经足够干净，可以尝试跳过吉他/钢琴 WAV 分离，直接让 YourMT3+ 输出多轨 MIDI。优势是避免二次音频分离带来的相位/瞬态损失；风险是转录模型对混音中的串音和混响也很敏感。

## 待核实

- 实际输出是否包含钢琴、木吉他、电吉他、弦乐等独立轨道；
- 对 Demucs/SCNet 分轨伪影的鲁棒性；
- 本机显存/速度；
- GPL-3.0 对应用分发的影响；
- 「cross-channel attention」等架构说法需要以论文/代码为准。
