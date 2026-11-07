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
| [Audio Separator](audio-separator/Audio-Separator.md) | 推理工具 / Python 包 | 通过 Demucs 6s；主要强项是 2/4 轨 | UVR 模型集合、CLI / Python API、模型下载、ensemble |
| [Music Source Separation Training](music-source-separation-training/Music-Source-Separation-Training.md) | 训练 + 推理框架 | 六轨目前仍是 HTDemucs4 6s | 包含 BS-RoFormer、Mel-Band RoFormer、SCNet、MDX23C 等；4 轨 SOTA 多 |
| [BS-RoFormer](bs-roformer/BS-RoFormer.md) | 模型架构 | 否（主要 2 轨） | 人声 / 伴奏强；适合作为级联第一阶段 |
| [SCNet](scnet/SCNet.md) | 模型架构 | 否（4 轨） | 鼓、贝斯、其他人声之外的分离强 |
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

## Gemini 推荐的级联路线（待验证，不是决策）

Gemini 的核心建议是不要指望单个六轨模型全面变强，而是：

1. 用强大的 RoFormer 模型先分「人声 / 伴奏」；
2. 把伴奏交给 4 轨或 6 轨模型，再拆鼓、贝斯、其他、吉他、钢琴；
3. 对每条 stem 用对应的 MIDI 模型；
4. 可选：加节拍网格、静音门限、去混响。

待验证的问题：

- 六轨仍是硬约束：强 RoFormer 主要是 2 轨，SCNet 是 4 轨；六轨需要组合或继续用 Demucs 6s；
- 级联后是否真的改善吉他 / 钢琴，还是只改善人声 / 鼓 / 贝斯；
- 多模型组合的显存、耗时、安装体积，以及当前 RTX 5060 / CUDA 环境能否稳定运行；
- 模型权重许可证各不相同，分发前要核对；
- 混响、串音和分轨伪影对 MIDI 的影响，需要用实际歌曲 A/B。

## 下一步

先对现有歌曲做 A/B，不直接换引擎：

- 基线：`htdemucs_6s`
- 候选：Audio Separator 的 BS-RoFormer / Mel-Band RoFormer + SCNet 或 6s 级联
- 重点听：吉他、钢琴、人声残留、鼓/贝斯干净度
- 同时记录：耗时、显存、模型体积、许可证
