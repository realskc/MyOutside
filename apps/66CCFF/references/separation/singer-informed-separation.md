# Singer-Informed Vocal Source Separation（按参考录音提取指定歌手）

- 最近核对：2026-11-10
- 论文：[arXiv:2608.14516](https://arxiv.org/abs/2608.14516)；代码与权重：[jocelynxu01/singer-separation-paper](https://github.com/jocelynxu01/singer-separation-paper)（许可证未核对）

## 是什么

给一段**目标歌手的短参考录音**，从多人演唱里只提取这位歌手（目前研究到两人合唱）。

## 已核实的事实

- 用歌手嵌入（拼接或 FiLM）引导分离；在合唱测试集上，目标歌手的 SI-SDR 从基线的 0.33 dB 提高到 5.58 dB（论文摘要）。
- 训练数据基于 DAMP-VSEP（Smule 卡拉 OK 录音）构造的合唱集（论文）。
