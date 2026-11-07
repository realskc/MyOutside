# SCNet

- 最近核对：2026-11-07
- 来源：[starrytong/SCNet](https://github.com/starrytong/SCNet)、[论文 arXiv:2401.13276](https://arxiv.org/abs/2401.13276)
- 许可证：代码仓库许可证需按具体仓库核对；MSST 中提供对应模型

## 是什么

Sparse Compression Network（稀疏压缩网络），音乐源分离架构，主要提供鼓、贝斯、人声、其他四轨模型。

## 事实

- MSST 预训练表：
  - SCNet Large（4 轨）Multisong avg 9.19；
  - SCNet XL IHF（4 轨）Multisong avg 9.92（bass 11.94、drums 11.58、vocals 9.68、other 6.48）；
  - 还有 SCNet Tran、SCNet Masked、SCNet XL 等变体。
- 这些数字来自 MSST 的预训练模型表，和 Demucs 6s 的评测口径不完全相同，不能直接把某一项差值当作确定的听感提升。
- 不是六轨模型。

## 和纯蓝的关系

适合在「人声已剥离」的伴奏上继续拆鼓、贝斯、其他；是 4 轨级联的候选，不直接替代六轨。

## 待核实

- 具体权重的许可证；
- 和 BS-RoFormer 4 轨、HTDemucs4 的实际听感对比；
- Windows / CUDA 兼容与推理耗时。
