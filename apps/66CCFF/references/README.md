# 66CCFF references

> 这里记录 **66CCFF（纯蓝）领域**的外部工具、模型和资料线索；不是 spec，也不是决策。
>
> 外部项目分两类：`separation/` 是分轨 / 音频源分离，`midi/` 是音频转 MIDI / 多轨转录。分类目录下，一个项目直接一个 `.md`；需要多个文件时用 `<项目名>-<主题>.md`，不再建项目目录。
>
> Gemini 对话（2026-11-07）只作为推荐来源之一；能核对的事实以官方仓库、论文或模型页面为准，未核对的标为「待核实」。不把 Gemini 原文复制进来。

## 作者说过的目标

- 作者弹钢琴，想把**吉他声部**转成自己能在钢琴上学习、弹奏的 MIDI；不需要还原吉他的弦位、指法或六线谱。
- 当前六轨分离质量不够好，想评估更强的技术；先研究，不急着换。

## 当前实现

- 六轨：`htdemucs_6s`（2022 年的 Demucs v4 六轨模型）。
- MIDI：Basic Pitch，独立 Python 3.10 + ONNX 引擎，单音频输入。

## 分轨 / 源分离候选

| 资料 | 类型 | 是否直接给六轨 | 备注 |
|---|---|---|---|
| [Audio Separator](separation/audio-separator.md) | 推理工具 / Python 包 | 注册表含 BS-RoFormer SW / Demucs 6s；需确认具体权重 | UVR 模型集合、CLI / Python API、模型下载、ensemble |
| [Music Source Separation Training](separation/music-source-separation-training.md) | 训练 + 推理框架 | 官方表里是 HTDemucs4 6s | 包含 BS-RoFormer、Mel-Band RoFormer、SCNet、MDX23C 等；社区权重可接 |
| [BS-RoFormer SW 6-stem](separation/bs-roformer-sw-6stem.md) | 社区权重 | **是**（bass / drums / other / vocals / guitar / piano） | 已跑通一首歌；权重许可证 unknown；SDR 数字来自下游项目，非官方；待听感 A/B |
| [HTDemucs 6-stem](separation/demucs-htdemucs-6s.md) | 当前权重 | 是（六轨） | Demucs 官方称六源实验性、piano 串音/伪影明显 |
| [BS-RoFormer](separation/bs-roformer.md) | 模型架构 | 否（主要 2 轨） | 人声 / 伴奏强；适合作为级联第一阶段 |
| [SCNet](separation/scnet.md) | 模型架构 | 否（4 轨） | 鼓、贝斯、其他人声之外的分离强 |
| [Mel-Band RoFormer Guitar](separation/becruily-mel-band-roformer-guitar.md) | 社区单轨权重 | 否（Guitar / Other） | 目标提取吉他；许可证和效果待验证 |
| [SCNet Jazz 4-stem](separation/scnet-jazz-4stem.md) | 社区单轨权重 | 否（drums / bass / piano / other） | 钢琴作为一级 source；适合去人声后的伴奏；许可证待核实 |
| [Banquet（query-bandit）](separation/banquet.md) | Query-based 分离 | 否；按 query 提取目标音色 | 论文称 guitar / piano 超过 6-stem HTDemucs；权重 CC-BY-NC-SA |
| [AudioSep](separation/audiosep.md) | 文本/音频 query 分离 | 否；按文本/音频提取目标 | 32kHz；适合实验，不适合高保真导出 |

## MIDI / 多轨转录候选

| 资料 | 类型 | 备注 |
|---|---|---|
| [Basic Pitch](midi/basic-pitch.md) | 单音频转 MIDI | 当前引擎；轻量、支持 pitch bend；混合音频会掉音符 |
| [MuScriptor](midi/muscriptor.md) | 多轨转录 | 2026 新模型；代码 MIT、权重 CC BY-NC 4.0；支持乐器条件 |
| [YourMT3+](midi/yourmt3.md) | 多轨转录 | 约 536MB；直接输出多乐器 MIDI；许可证存在 GPL/Apache 不一致 |
| [mt3-infer](midi/mt3-infer.md) | 统一推理工具 | 封装 MR-MT3 / MT3-PyTorch / YourMT3；不含 MuScriptor |
| [MR-MT3](midi/mr-mt3.md) | 多轨转录 | 跨窗口记忆，缓解乐器串轨；约 176MB |
| [MT3-PyTorch](midi/mt3-pytorch.md) | 多轨转录 | 社区 PyTorch 移植；上游无许可证声明 |
| [Music-to-MIDI（mason369）](midi/music-to-midi.md) | 下游整合工具 | 使用 BS-RoFormer SW 六轨；其 README 是 9.05 / 7.83 数字的来源之一 |

## 其他 MIDI 线索

- **NeuralNote**：Basic Pitch 的 GUI / VST 封装，适合快速试听和调阈值，不是后端引擎。
- **ByteDance Piano Transcription / `piano_transcription_inference`**：钢琴专用，可能比 Basic Pitch 更适合钢琴轨。
- **Transkun**：[Yujia-Yan/Transkun](https://github.com/Yujia-Yan/Transkun)（MIT），钢琴转录候选。
- **SOME / RMVPE**：人声旋律候选。
- **FretNet / SynthTab / TabCNNx4 / Open-Fret / gtrsnipe**：吉他弦位、指法、六线谱路线；作者不弹吉他，优先级低。
- **Beat This!**：节拍 / downbeat 检测，可把 MIDI 对齐到小节。
- **De-reverb / De-echo 模型**：减少混响尾音对音符切分的干扰。

## 对 Gemini 说法的核对

- Gemini 说的 **BS-RoFormer SW 六轨**确实存在：`enerjazzer/BS-ROFO-SW-Fixed` / `FractalSurfer/BS-RoFormer-SW-6stem` 提供权重，`openmirlab/bs-roformer-infer` 把它作为默认模型之一；它不在 MSST 官方预训练表里，属于社区权重。
- Gemini 说的 **MSST 社区 RoFormer / MDX23C 吉他与钢琴专属单轨模型**：MSST 官方表和文件树里没有；目前能确认的开放候选是 [`becruily/mel-band-roformer-guitar`](separation/becruily-mel-band-roformer-guitar.md)（Guitar / Other，许可证未声明），钢琴有 HF 上的非商用模型。不能把「有专精转录模型」误当成「有六轨分离模型」。
- Gemini 的 Transkun / ByteDance Piano / Basic Pitch / YourMT3+ / SOME 属于**转 MIDI**，不是分轨。
- `guitar 9.05 / piano 7.83` 来自下游 [Music-to-MIDI](midi/music-to-midi.md) README，不是 BS-RoFormer SW 模型卡或 MSST 官方表；MVSEP 另一条记录采用 4 轨合并口径，没有单独 guitar/piano SDR。
- `htdemucs_6s` 的 `5.22 / 2.23` 不是 Demucs 官方基准；官方只说六源实验性、piano 串音/伪影明显。
- `audio-separator` 的模型列表里有 `BS-Roformer-SW.ckpt`，但没有确认它等同于 `BS-Rofo-SW-Fixed.ckpt`；`bs-roformer-infer` 才是明确绑定 Fixed 版的工具。
- 因此「强六轨」不是完全不存在：**BS-RoFormer SW 6-stem**是目前最值得实测的候选；只是它不在 MSST 官方仓库里。
- **MuScriptor** 确实存在；代码 MIT、权重 CC BY-NC 4.0；有 170k 首 / 11k 小时真实数据、GRPO 类 RL、instrument conditioning、tempo/MuseScore 集成；它是转录模型，不是分轨模型。
- **mt3-infer** 封装 MR-MT3 / MT3-PyTorch / YourMT3，不包含 MuScriptor；MT3-PyTorch 是社区移植，不是 Magenta 官方 JAX/T5X 实现。

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

### 现在可查证的几条候选路线

1. **直接六轨**：BS-RoFormer SW 6-stem（已跑通一首歌）。
2. **先净化伴奏，再单轨提取**：
   - 用 SCNet / RoFormer 去掉 vocals / drums / bass，得到 `Other`；
   - 吉他：`becruily/mel-band-roformer-guitar`，或 Banquet 用吉他 query；
   - 钢琴：`SCNet Jazz 4-stem`，或 BS-RoFormer SW 的 piano 轨；
   - 再跑 Basic Pitch / Transkun。
3. **跳过音频分离，直接符号级转录**：
   - 把 `Instrumental` / `Other` 交给 MuScriptor 或 YourMT3+，尝试直接得到带乐器标签的多轨 MIDI；
   - MuScriptor 支持 instrument presence conditioning，但权重 CC BY-NC；YourMT3 许可证存在不一致；
   - 这条路避免了二次分离，但依赖转录模型对混音/串音的鲁棒性，尚未验证。

三条路线都还没有在纯蓝的同一批歌曲上做完整 A/B；上面的模型存在性已核对，效果仍需试听/指标验证。

## 下一步

本机已经跑通 **BS-RoFormer SW 6-stem** 的一首歌测试（未播放声音）：

- 基线：`htdemucs_6s`
- 已生成候选：BS-RoFormer SW 六轨，在 `tracks/<id>/roformer-test/`
- 下一步：试听对比吉他、钢琴、人声残留、鼓/贝斯干净度；再决定是否替换引擎
- 备选：Audio Separator 的 BS-RoFormer / Mel-Band RoFormer + SCNet 或 6s 级联
- 同时记录：耗时、显存、模型体积、许可证
