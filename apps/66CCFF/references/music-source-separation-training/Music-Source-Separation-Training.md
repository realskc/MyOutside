# Music Source Separation Training（MSST）

- 最近核对：2026-11-07
- 来源：[ZFTurbo/Music-Source-Separation-Training](https://github.com/ZFTurbo/Music-Source-Separation-Training)
- 许可证：MIT（代码仓库标注）

## 是什么

音乐源分离的训练 / 推理框架，由 MVSep 团队维护。支持多种架构和预训练权重，也提供 `msst` Python 包与 CLI。

## 事实

- 支持架构：MDX23C、HTDemucs、BS-RoFormer、Mel-Band RoFormer、SCNet、BandIt、Apollo、BSMamba2 等。
- 预训练模型表里：
  - HTDemucs4（4 轨）Multisong avg 9.16；
  - HTDemucs4 6 stems（6 轨）Multisong：bass 11.22、drums 10.22、vocals 8.05；piano / guitar 没有给出 SDR；
  - SCNet XL IHF（4 轨）Multisong avg 9.92；
  - BS-RoFormer（4 轨）Multisong avg 9.38；
  - BS-RoFormer 人声模型 SDR vocals 10.87（不同评测集，数字不能直接横比）。
- 6 轨属于少数；当前表中明确的 6 轨是 HTDemucs4 6 stems，强 RoFormer / SCNet 预训练模型主要是 2 轨或 4 轨。
- 提供 ensemble 脚本；模型权重托管在 GitHub Releases / HuggingFace 等不同位置。

## 和纯蓝的关系

它是研究 SOTA 模型和组合方案的主要参考框架；比直接写模型推理更适合做 A/B 和后续替换。

## 待核实

- `msst` 包在 Windows + 当前 CUDA 环境的安装与运行；
- 6 轨组合方案的实际效果；
- 各权重的许可证和体积；
- 推理速度 / 显存。
