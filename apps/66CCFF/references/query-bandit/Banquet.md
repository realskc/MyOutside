# Banquet（query-bandit）

- 最近核对：2026-11-07
- 代码：[kwatcharasupat/query-bandit](https://github.com/kwatcharasupat/query-bandit)（MIT）
- 论文：*A Stem-Agnostic Single-Decoder System for Music Source Separation Beyond Four Stems*（ISMIR 2024，[arXiv:2406.18747](https://arxiv.org/abs/2406.18747)）
- 权重：[Zenodo record 13694558](https://zenodo.org/records/13694558)，推荐 `ev-pre-aug.ckpt`；权重许可证为 **CC-BY-NC-SA-4.0**

## 是什么

Query-based 音乐源分离系统：给一段目标乐器的参考音频（query），从混音中提取同类音色。使用 Bandit 分离骨干 + PaSST 乐器识别模型，单一 decoder 支持多种 stem。

## 官方事实

- 训练/评测使用 MoisesDB，覆盖四轨之外的细分乐器。
- 论文摘要称：24.9M 可训练参数，在 VDBO stems 上接近更复杂的 6-stem HTDemucs，在 **guitar / piano** 上超过它。
- 支持窄类别提取，例如 clean acoustic guitar、organ、reeds 等。
- 推理需要：
  - 待分离音频；
  - 一段干净的 query 参考音频；
  - 指定输出路径；
  - GPU 显存建议较高（README 示例 batch size 12 面向 RTX 4090）。

## 与纯蓝的关系

如果已经有干净的吉他或钢琴参考片段，它可能比固定六轨模型更适合提取特定音色；但它不是「输入整首歌就自动分六轨」的黑盒，需要 query。

## 待核实

- 当前 RTX 5060 显存能否运行合适 batch；
- query 的选取对结果影响；
- 权重 CC-BY-NC-SA 许可证对分发的限制；
- 对 Demucs 分轨伪影的鲁棒性。
