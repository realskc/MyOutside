# BS-RoFormer

- 最近核对：2026-11-07
- 来源：[lucidrains/BS-RoFormer](https://github.com/lucidrains/BS-RoFormer)、[论文 arXiv:2309.02612](https://arxiv.org/abs/2309.02612)
- 许可证：架构代码 MIT；具体权重许可证随发布者不同

## 是什么

Band-Split RoFormer：按频带拆分音频，再用 RoFormer 做音乐源分离的架构。最常见用途是 **vocals / instrumental 两轨**分离。

## 事实

- MSST 预训练表里的 BS-RoFormer 人声 / 伴奏模型：SDR vocals 10.87（Multisong 评测）。
- MSST 的 4 轨 BS-RoFormer：Multisong avg 9.38（bass 11.08、drums 11.29、vocals 9.19、other 5.96）。
- Audio Separator 的默认模型 `model_bs_roformer_ep_317_sdr_12.9755.ckpt` 是 2 轨 vocals / instrumental，模型列表标称 vocals SDR 12.9、instrumental 17.0（来源为 UVR 模型列表，评测口径需核对）。
- 社区还有大量微调权重（不同发布者、不同训练集），质量与许可证不能一概而论。
- **六轨变体**：社区的 [BS-RoFormer SW 6-stem](bs-roformer-sw-6stem.md) 是同一架构下的六轨权重，和这里的 2/4 轨模型不是同一个文件。

## 和纯蓝的关系

普通 BS-RoFormer 适合作为「先分离人声 / 伴奏」的第一阶段；不直接产出六轨。六轨候选见 BS-RoFormer SW。

## 待核实

- 具体权重的来源、许可证和训练数据；
- 在当前歌曲上的实际串音与听感；
- 和 Mel-Band RoFormer 的 A/B 结果。
