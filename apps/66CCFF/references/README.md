# 66CCFF references

> 这里记录 **66CCFF（纯蓝）领域**的外部工具、模型和资料线索；不是 spec，也不是决策。
>
> 外部项目分三类：`separation/` 是分轨 / 音频源分离，`midi/` 是音频转 MIDI / 多轨转录，`piano-roll/` 是钢琴卷帘 / MIDI 查看与学琴工具（给纯蓝的卷帘设计做参考）。分类目录下，一个项目直接一个 `.md`；需要多个文件时用 `<项目名>-<主题>.md`，不再建项目目录。
>
> Gemini 对话（2026-11-07）只作为推荐来源之一；能核对的事实以官方仓库、论文或模型页面为准，未核对的标为「待核实」。不把 Gemini 原文复制进来。

## 作者说过的目标

- 作者弹钢琴，想把**吉他声部**转成自己能在钢琴上学习、弹奏的 MIDI；不需要还原吉他的弦位、指法或六线谱。
- 旧六轨引擎质量不够好；2026-11-07 作者试听 BS-RoFormer SW 后确认明显更好，已切换到新引擎。

## 当前实现

- 六轨：BS-RoFormer SW 6-stem（`BS-Rofo-SW-Fixed.ckpt`；Windows CUDA、macOS CPU；见 [66CCFF-0008](../user-spec/decisions/66CCFF-0008-bs-roformer-engine.md)）。
- MIDI：MuScriptor 0.4.0（medium），已接进应用（[66CCFF-0012](../user-spec/decisions/66CCFF-0012-muscriptor-in-app-transcription.md)）；人声旋律用 GAME large（[66CCFF-0017](../user-spec/decisions/66CCFF-0017-game-vocal-midi.md)）；之前的 Basic Pitch 作者反馈效果一般，应用已不再使用。

## 分轨 / 源分离候选

| 资料 | 类型 | 是否直接给六轨 | 备注 |
|---|---|---|---|
| [Audio Separator](separation/audio-separator.md) | 推理工具 / Python 包 | 注册表含 BS-RoFormer SW / Demucs 6s；需确认具体权重 | UVR 模型集合、CLI / Python API、模型下载、ensemble |
| [Music Source Separation Training](separation/music-source-separation-training.md) | 训练 + 推理框架 | 官方表里是 HTDemucs4 6s | 包含 BS-RoFormer、Mel-Band RoFormer、SCNet、MDX23C 等；社区权重可接 |
| [BS-RoFormer SW 6-stem](separation/bs-roformer-sw-6stem.md) | 社区权重 | **是**（bass / drums / other / vocals / guitar / piano） | 作者试听确认明显优于旧模型；已选为应用分离引擎（66CCFF-0008）；权重许可证 unknown |
| [HTDemucs 6-stem](separation/demucs-htdemucs-6s.md) | 旧权重（已弃用） | 是（六轨） | Demucs 官方称六源实验性、piano 串音/伪影明显；已被 BS-RoFormer SW 取代 |
| [BS-RoFormer](separation/bs-roformer.md) | 模型架构 | 否（主要 2 轨） | 人声 / 伴奏强；适合作为级联第一阶段 |
| [SCNet](separation/scnet.md) | 模型架构 | 否（4 轨） | 鼓、贝斯、其他人声之外的分离强 |
| [Mel-Band RoFormer Guitar](separation/becruily-mel-band-roformer-guitar.md) | 社区单轨权重 | 否（Guitar / Other） | 目标提取吉他；许可证和效果待验证 |
| [SCNet Jazz 4-stem](separation/scnet-jazz-4stem.md) | 社区单轨权重 | 否（drums / bass / piano / other） | 钢琴作为一级 source；适合去人声后的伴奏；许可证待核实 |
| [Banquet（query-bandit）](separation/banquet.md) | Query-based 分离 | 否；按 query 提取目标音色 | 论文称 guitar / piano 超过 6-stem HTDemucs；权重 CC-BY-NC-SA |
| [AudioSep](separation/audiosep.md) | 文本/音频 query 分离 | 否；按文本/音频提取目标 | 32kHz；适合实验，不适合高保真导出 |

## MIDI / 多轨转录候选

| 资料 | 类型 | 备注 |
|---|---|---|
| [Basic Pitch](midi/basic-pitch.md) | 单音频转 MIDI | 当前引擎；轻量、支持 pitch bend；混合音频会掉音符；作者反馈转写效果一般，后续评估替代方案 |
| [MuScriptor](midi/muscriptor.md) | 多轨转录 | 2026 新模型；代码 MIT、权重 CC BY-NC 4.0；medium 已试跑，作者听感明显好于 Basic Pitch；分轨和直接转效果都好，精细对比待钢琴卷帘 |
| [YourMT3+](midi/yourmt3.md) | 多轨转录 | 约 536MB；直接输出多乐器 MIDI；许可证存在 GPL/Apache 不一致 |
| [mt3-infer](midi/mt3-infer.md) | 统一推理工具 | 封装 MR-MT3 / MT3-PyTorch / YourMT3；不含 MuScriptor |
| [MR-MT3](midi/mr-mt3.md) | 多轨转录 | 跨窗口记忆，缓解乐器串轨；约 176MB |
| [MT3-PyTorch](midi/mt3-pytorch.md) | 多轨转录 | 社区 PyTorch 移植；上游无许可证声明 |
| [Music-to-MIDI（mason369）](midi/music-to-midi.md) | 下游整合工具 | 使用 BS-RoFormer SW 六轨；其 README 是 9.05 / 7.83 数字的来源之一 |

## 人声转 MIDI 候选（单旋律）

| 资料 | 备注 |
|---|---|
| [GAME](midi/game.md) | openvpi（中文虚拟歌手社区），SOME 的下一代；对分离出的人声稳；原生支持普通话 / 日语；权重 CC BY-NC-SA；《白石溪》上作者听了觉得基本可用（[想法](midi/game-thoughts.md)） |
| [ROSVOT](midi/rosvot.md) | ACL 2024；权重用普通话训练；能处理带伴奏的人声 |
| [VocalParse](midi/vocalparse.md) | 2026，音频大模型，同时出歌词和音符；普通话；不预测音符时长 |

## 多人歌声分离（合唱拆成各自一条）

| 资料 | 备注 |
|---|---|
| [UNMIXX](separation/unmixx.md) | ICASSP 2026，盲分离两位歌手；仓库带权重；未声明许可证；《白石溪》上几乎没分开两个人（[想法](separation/unmixx-thoughts.md)） |
| [按参考录音提取指定歌手](separation/singer-informed-separation.md) | 给一段目标歌手的独唱参考，提取这位歌手；在虚拟歌手上用不了（拼接版因代码 bug 根本不看参考，FiLM 版结果乱；作者听了：几乎啥都没分出来，[想法](separation/singer-informed-separation-thoughts.md)） |
| [duet-svs-diffusion](separation/duet-svs-diffusion.md) | SDX 2023，单人歌声扩散先验 + 自回归采样分对唱；《白石溪》上身份保持不住（55%）；更新的扩散分离都是分人声 / 伴奏 |
| [timbreAMT](separation/timbreamt.md) | TISMIR 2026，不分离音频、按音色把音符聚成几条 MIDI；按乐器类别训练；《白石溪》上两类不是两个人（54%），作者看了：基本没分出来（[想法](separation/timbreamt-thoughts.md)） |
| [SpeechBrain ECAPA](separation/speechbrain-ecapa.md) | 说话人识别模型；不分离，改为判断「谁在唱」再把 GAME 的音符分到两个人；作者听了：比 UNMIXX 好，但还不可用（[想法](separation/speechbrain-ecapa-thoughts.md)）；两人同时唱不同的音时无能为力 |
| [MedleyVox 与合唱分离模型](separation/medleyvox.md) | 评测集 + 社区模型（Cyru5 权重、MVSEP duet 模型、karaoke 模型） |

## 钢琴卷帘 / MIDI 查看工具

| 资料 | 形式 | 我们的想法 | 备注 |
|---|---|---|---|
| [GarageBand（库乐队）](piano-roll/GarageBand.md) | macOS 免费 DAW | [有](piano-roll/GarageBand-thoughts.md) | 横向卷帘，左边有琴键；作者试过，觉得挺好，但只能一次放大看一条轨 |
| [Signal](piano-roll/Signal.md) | 开源网页 MIDI 编辑器 | [有](piano-roll/Signal-thoughts.md) | 多轨横向卷帘；音符块够大时显示音名 |
| [Midiano](piano-roll/Midiano.md) | 网页学琴工具 | [有](piano-roll/Midiano-thoughts.md) | 音符从上往下落到琴键上，带小节线、按乐器上色；作者很喜欢 |
| [Neothesia](piano-roll/Neothesia.md) | 开源桌面学琴软件 | [有](piano-roll/Neothesia-thoughts.md) | 音符从上往下落到琴键上 |
| [noteDigger](piano-roll/noteDigger.md) | 网页辅助扒谱工具（中文） | 暂无 | 在频谱上画 MIDI 音符；节拍检测、去谐波、AI 转写当参考；timbreAMT 的作者做的 |

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

作者已经试听 **BS-RoFormer SW 6-stem**，确认六轨效果明显好于旧 `htdemucs_6s`，应用已切换到新引擎（见 66CCFF-0008）：

- 旧引擎 `htdemucs_6s` 不再使用；
- 继续观察新引擎在不同歌曲上的吉他 / 钢琴稳定性；
- MIDI 转写仍是 Basic Pitch，作者认为效果一般，后续另行评估专用钢琴转写、多轨转录等方案；
- 备选分轨路线（Audio Separator、SCNet、Mel-Band RoFormer 等）保留作后续研究，不急于接入。
