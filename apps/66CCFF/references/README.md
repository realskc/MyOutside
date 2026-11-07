# 66CCFF references

> 这里记录 **66CCFF（纯蓝）领域**的外部工具、模型和资料线索；不是 spec，也不是决策。
>
> Gemini 对话（2026-11-07）只作为推荐来源之一。能核对的事实以官方仓库、论文或模型页面为准；未核对的标为「待核实」。不把 Gemini 原文复制进来。

## 作者说过的目标

- 作者弹钢琴，想把**吉他声部**转成自己能在钢琴上学习、弹奏的 MIDI；不需要还原吉他的弦位、指法或六线谱。
- 当前六轨分离质量不够好，想评估更强的技术；先研究，不急着换。

## 当前实现

- 六轨：`htdemucs_6s`（2022 年的 Demucs v4 六轨模型）。
- MIDI：Basic Pitch，独立 Python 3.10 + ONNX 引擎，单音频输入。

## 分轨候选

| 资料 | 类型 | 是否直接给六轨 | 备注 |
|---|---|---|---|
| [Audio Separator](audio-separator/Audio-Separator.md) | 推理工具 / Python 包 | 注册表含 BS-RoFormer SW / Demucs 6s；需确认具体权重 | UVR 模型集合、CLI / Python API、模型下载、ensemble |
| [Music Source Separation Training](music-source-separation-training/Music-Source-Separation-Training.md) | 训练 + 推理框架 | 官方表里是 HTDemucs4 6s | 包含 BS-RoFormer、Mel-Band RoFormer、SCNet、MDX23C 等；官方表没有强六轨，但社区权重可接 |
| [BS-RoFormer SW 6-stem](bs-roformer/BS-RoFormer-SW-6stem.md) | 社区权重 | **是**（bass / drums / other / vocals / guitar / piano） | 已跑通一首歌；权重许可证 unknown；SDR 数字来自下游项目，非官方；待听感 A/B |
| [HTDemucs 6-stem](demucs/HTDemucs-6s.md) | 当前权重 | 是（六轨） | Demucs 官方称六源实验性、piano 串音/伪影明显 |
| [Music-to-MIDI（mason369）](music-to-midi/Music-to-MIDI.md) | 下游整合工具 | 使用 BS-RoFormer SW 六轨 | 其 README 是 9.05 / 7.83 数字的来源之一；不是官方 benchmark |
| [BS-RoFormer](bs-roformer/BS-RoFormer.md) | 模型架构 | 否（主要 2 轨） | 人声 / 伴奏强；适合作为级联第一阶段 |
| [SCNet](scnet/SCNet.md) | 模型架构 | 否（4 轨） | 鼓、贝斯、其他人声之外的分离强 |
| [Mel-Band RoFormer Guitar](becruily/Mel-Band-RoFormer-Guitar.md) | 社区单轨权重 | 否（Guitar / Other） | 目标提取吉他；许可证和效果待验证 |
| Mel-Band RoFormer | 模型架构 | 否（主要 2 轨） | 待建资料；和 BS-RoFormer 同属 RoFormer 路线 |
| MVSEP | 在线服务 / 模型试验场 | 可能 | 可先在线听不同模型效果；不是本地集成方案 |
| MSST-WebUI | GUI | 取决于模型 | MSST 的桌面封装；待核实当前状态 |

## MIDI 候选（先记线索，暂不建独立资料）

- [**Basic Pitch**](basic-pitch/Basic-Pitch.md)：当前引擎；轻量、支持 pitch bend、单乐器效果好；混合音频会掉音符。
- **NeuralNote**：Basic Pitch 的 GUI / VST 封装，适合快速试听和调阈值，不是后端引擎。
- **ByteDance Piano Transcription / `piano_transcription_inference`**：钢琴专用，可能比 Basic Pitch 更适合钢琴轨。
- **Transkun v2**：钢琴转录候选。
- **YourMT3+**：多乐器端到端转录候选。
- **SOME / RMVPE**：人声旋律候选。
- **FretNet / SynthTab / TabCNNx4 / Open-Fret / gtrsnipe**：吉他弦位、指法、六线谱路线；作者不弹吉他，优先级低。
- **Beat This!**：节拍 / downbeat 检测，可把 MIDI 对齐到小节。
- **De-reverb / De-echo 模型**：减少混响尾音对音符切分的干扰。

## 对 Gemini 说法的核对

- Gemini 说的 **BS-RoFormer SW 六轨**确实存在：`enerjazzer/BS-ROFO-SW-Fixed` / `FractalSurfer/BS-RoFormer-SW-6stem` 提供权重，`openmirlab/bs-roformer-infer` 把它作为默认模型之一；它不在 MSST 官方预训练表里，属于社区权重。
- Gemini 说的 **MSST 社区 RoFormer / MDX23C 吉他与钢琴专属单轨模型**：MSST 官方表和文件树里没有；目前能确认的开放候选是 `becruily/mel-band-roformer-guitar`（Guitar / Other，许可证未声明），钢琴有 HF 上的非商用模型。不能把「有专精转录模型」误当成「有六轨分离模型」。
- Gemini 的 Transkun / ByteDance Piano / Basic Pitch / YourMT3+ / SOME 属于**转 MIDI**，不是分轨。
- `guitar 9.05 / piano 7.83` 来自下游 [Music-to-MIDI](music-to-midi/Music-to-MIDI.md) README，不是 BS-RoFormer SW 模型卡或 MSST 官方表；MVSEP 另一条记录采用 4 轨合并口径，没有单独 guitar/piano SDR。
- `htdemucs_6s` 的 `5.22 / 2.23` 不是 Demucs 官方基准；官方只说六源实验性、piano 串音/伪影明显。
- `audio-separator` 的模型列表里有 `BS-Roformer-SW.ckpt`，但没有确认它等同于 `BS-Rofo-SW-Fixed.ckpt`；`bs-roformer-infer` 才是明确绑定 Fixed 版的工具。
- 因此「强六轨」不是完全不存在：**BS-RoFormer SW 6-stem**是目前最值得实测的候选；只是它不在 MSST 官方仓库里。

## Gemini 推荐的级联路线（待验证，不是决策）

Gemini 的核心建议是不要指望单个六轨模型全面变强，而是：

1. 用强大的 RoFormer 模型先分「人声 / 伴奏」；
2. 把伴奏交给 4 轨或 6 轨模型，再拆鼓、贝斯、其他、吉他、钢琴；
3. 对每条 stem 用对应的 MIDI 模型；
4. 可选：加节拍网格、静音门限、去混响。

待验证的问题：

- 六轨有社区 BS-RoFormer SW 可以直接试；其他强 RoFormer / SCNet 仍主要是 2/4 轨，级联是另一条路线；
- BS-RoFormer SW 是否真的改善吉他 / 钢琴，还是只改善人声 / 鼓 / 贝斯；
- 多模型组合的显存、耗时、安装体积，以及当前 RTX 5060 / CUDA 环境能否稳定运行；
- 模型权重许可证各不相同，分发前要核对；
- 混响、串音和分轨伪影对 MIDI 的影响，需要用实际歌曲 A/B。

## 下一步

本机已经跑通 **BS-RoFormer SW 6-stem** 的一首歌测试（未播放声音）：

- 基线：`htdemucs_6s`
- 已生成候选：BS-RoFormer SW 六轨，在 `tracks/<id>/roformer-test/`
- 下一步：试听对比吉他、钢琴、人声残留、鼓/贝斯干净度；再决定是否替换引擎
- 备选：Audio Separator 的 BS-RoFormer / Mel-Band RoFormer + SCNet 或 6s 级联
- 同时记录：耗时、显存、模型体积、许可证
