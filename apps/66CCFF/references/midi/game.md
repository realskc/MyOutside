# GAME（Generative Adaptive MIDI Extractor）

- 最近核对：2026-11-10
- 代码：[openvpi/GAME](https://github.com/openvpi/GAME)（MIT）；预训练模型：[Releases](https://github.com/openvpi/GAME/releases)（**CC BY-NC-SA 4.0**，非商用）
- 前身：[openvpi/SOME](https://github.com/openvpi/SOME)（Singing-Oriented MIDI Extractor，MIT，2023）

## 是什么

openvpi（DiffSinger / 中文虚拟歌手社区）做的**人声转 MIDI**模型，SOME 的下一代：把单旋律的歌声转成音符（MIDI），音高是浮点值。

## 已核实的事实

- 边界检测用离散扩散（D3PM），可以在质量和速度之间取舍（去噪步数默认 8）；音符和音高可以对齐到已知的字边界（README）。
- 号称对「脏」的或分离出来的人声也稳：带噪声、混响甚至伴奏都能转（README）。
- 预训练模型 v1.0.0（2026-03-07）：small 约 12M、medium 约 50M、large 约 100M 参数；训练数据约 32 小时人工标注的私有歌声数据，加噪声 / 伴奏 / 混响数据增强（含亚洲民族乐器数据）；原生语言：英语、日语、粤语、普通话，可以指定语言改善分段（Releases）。
- v1.0.3（2026-03-09）附带 ONNX 模型；有给 OpenUTAU 用的依赖包（Releases）。
- 命令行：`python infer.py extract <音频或目录> -m <模型>`，输出 MIDI，也可以输出 txt / csv（README）。
- 社区工具 [Vocal2Midi](https://github.com/splinter21/Vocal2Midi)（MIT）基于 GAME，纯 ONNX 推理，带歌词识别与对齐（FunASR + HubertFA）和 Gradio 界面。
- 只处理**单旋律**：两个人同时唱的地方不会分成两条。

## 本机验证（Mac，2026-11-10）

- 环境：GAME v1.0.3 代码 + GAME-1.0 large 权重（压缩包 349MB），Python 3.12 venv，PyTorch 2.15，Apple M4 Pro，MPS（Lightning 自动选择）。装在临时目录里试，没有接进纯蓝。
- 命令：`python infer.py extract <人声> -m GAME-1.0-large/model.pt -l zh --output-dir <目录> --output-formats mid,csv`。不给 `--output-dir` 时结果写在音频旁边；MIDI 用固定速度（默认 120 BPM）。
- 《白石溪》BS-RoFormer SW 分出的 vocals（5 分 34 秒）：用时 82 秒（含加载模型）；373 个音符，**没有重叠**（单旋律），音高 56–77（G♯3–F5），中位 F4。开头 F4 D4 C4 A♯3 C4 A♯3 C4 F4……
- 同一条人声，MuScriptor（`voice`）是 538 个音符，音高 47–97，相邻音符重叠 104 处，39 个音高于 G5。
- GAME 的 373 个音符里，在同一时间有 MuScriptor 同音高音符的：直接比是 277 个（74%）；减掉 MuScriptor 为对齐小节线加的 0.3986 秒延后（66CCFF-0016）后是 366 个（98%）。MuScriptor 多出来的主要是高八度以上的音和叠音。
- CSV 里音高带音分（如 `F4-6`、`C4-30`），写 MIDI 时取整。
- 为了和 MuScriptor 的结果用同一套小节线，把 GAME 的音符按 MuScriptor 人声 MIDI 的速度表（128 个速度变化）重新换算成 tick，并照 MuScriptor 的约定延后 0.3986 秒、写同样的 marker，另存为 `~/Downloads/白石溪 MIDI/白石溪-人声-GAME.mid`（开始时间误差 < 1 毫秒）。作者听了觉得基本可用（见 [想法](game-thoughts.md)）。
