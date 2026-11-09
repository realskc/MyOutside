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
