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
- **6 轨是模型目标，不是框架自动能力**：
  - `config_htdemucs_6stems.yaml` 的 `instruments` 是 `drums / bass / other / vocals / guitar / piano`；
  - 对应权重是 `5c90dfd2-34c22ccb.th`，即当前纯蓝使用的 HTDemucs4 6-stem 模型；
  - 因此 MSST **可以运行六轨**；但官方表里的这条六轨路线就是当前 HTDemucs4 6-stem，本身没有更新。
- 官方预训练表中没有基于 BS-RoFormer / SCNet 的强六轨权重；强 RoFormer / SCNet 预训练模型主要是 2 轨或 4 轨。MSST 可以用这些模型做级联、单轨模型或 ensemble，但不是“一个模型直接六轨”。
- **社区有例外**：[BS-RoFormer SW 6-stem](bs-roformer-sw-6stem.md) 是 MSST 架构下的社区六轨权重，不在官方表里，但可由 MSST / `bs-roformer-infer` 加载；这是当前最值得实测的六轨候选。
- 如果要从零训练六轨模型，MSST 支持自定义 `instruments` 配置，但需要带六轨标注的数据和训练算力；这不是现成权重。
- 提供 ensemble 脚本；模型权重托管在 GitHub Releases / HuggingFace 等不同位置。

## Gemini 线索的核对

- Gemini 提到「MSST 社区的 RoFormer / MDX23C 吉他与钢琴专属单轨模型」。MSST 官方 `pretrained_models.md` 和仓库文件树里没有对应的吉他 / 钢琴单轨权重或配置；但社区确实有 [becruily/mel-band-roformer-guitar](becruily-mel-band-roformer-guitar.md)（Guitar / Other，许可证未声明）。钢琴方面 HF 有 [tjpurdy/Piano-Separation-Model-small](https://huggingface.co/tjpurdy/Piano-Separation-Model-small)（CC-BY-NC-4.0，2026）。这些需要单独验证。
- 另一个重要例外是 [BS-RoFormer SW 6-stem](bs-roformer-sw-6stem.md)：它不是官方 MSST 权重，但确实是社区六轨模型，不能因为官方表没有就判定不存在。
- Gemini 的 Stage 3（Transkun、ByteDance Piano、Basic Pitch、YourMT3+、SOME）是**音频转 MIDI 的转录模型**，不是分轨模型；它们不能替代把吉他从混音/伴奏中分离出来。

## 和纯蓝的关系

它是研究 SOTA 模型和组合方案的主要参考框架；比直接写模型推理更适合做 A/B 和后续替换。

## 待核实

- `msst` 包在 Windows + 当前 CUDA 环境的安装与运行；
- 6 轨组合方案的实际效果；
- 各权重的许可证和体积；
- 推理速度 / 显存。
