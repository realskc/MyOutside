# MR-MT3

- 最近核对：2026-11-07
- 代码：[gudgud96/MR-MT3](https://github.com/gudgud96/MR-MT3)（MIT）
- 权重：[gudgud1014/MR-MT3](https://huggingface.co/gudgud1014/MR-MT3)（MIT）
- 论文：[arXiv:2403.10024](https://arxiv.org/abs/2403.10024)

## 是什么

Memory Retaining Multi-Track Music Transcription：在 MT3 的解码器中保留跨窗口记忆，缓解长音频切片处的 **instrument leakage**（一个乐器的尾音在下一片被误判成别的乐器）。

## 已核实的事实

- 仓库和 HF 权重存在；权重约 176MB。
- 原始仓库包含训练/评测脚本，依赖较旧（TensorFlow 2.11、note-seq、特定 Transformers 等），不适合直接集成。
- `mt3-infer` 已封装它，提供较干净的推理接口。

## 与纯蓝的关系

如果采用「音频直接转多轨 MIDI」的路线，它是比原版 MT3 更抗切片串轨的候选；但仍不是音频分轨模型。

## 待核实

- 实际多轨输出类别和音质；
- 对真实混音/分离伪影的鲁棒性；
- 许可证与分发。
