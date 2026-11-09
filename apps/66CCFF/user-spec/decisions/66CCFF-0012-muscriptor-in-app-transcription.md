# 66CCFF-0012 转 MIDI 接进纯蓝：MuScriptor，所选 stem → 一个乐器 → 单轨 MIDI，结果存进曲目

- 状态：有效（音符数的统计方式被 [66CCFF-0014](66CCFF-0014-note-count-from-midi.md) 取代）
- 日期：2026-11-09
- 决策者：讨论（作者定了「转 MIDI 暂时就用 MuScriptor」并要求现在接进应用；具体设计由 agent）
- 取代：[66CCFF-0007](66CCFF-0007-basic-pitch-midi.md) 中「使用 Basic Pitch」「界面 / API 待接入」的部分
- 服务于：
  - 作者预期：[`../README.md`](../README.md)「核心流程与预期」MIDI 转写（输入是单条 stem 或选定 stem 的混合，不转整首歌；输出一个单轨 MIDI；目标是在钢琴上学、弹）
  - 上游决策：[66CCFF-0003](66CCFF-0003-engine-setup-script.md)（应用管理自己的引擎）、[66CCFF-0006](66CCFF-0006-separation-job-execution.md)（异步任务 + runId 事件 / 取消）、[66CCFF-0010](66CCFF-0010-midi-roll-viewer.md)（钢琴卷帘）

## 背景

ThinkBook 上试过 MuScriptor（[资料](../../references/midi/muscriptor.md)）：作者听感明显好于 Basic Pitch，分轨后转和直接转伴奏效果都很好。之前转写只能在命令行里跑，结果要手动在卷帘里打开文件。

## 决策

- **引擎**：MuScriptor 0.4.0，`medium` 权重（它的默认值）；装在 `<userData>/apps/66CCFF/muscriptor-engine/venv`（Python 3.12），权重缓存在同目录的 `models/`。安装脚本：macOS `scripts/setup-muscriptor-macos.sh`（Apple Silicon 自动用 Metal / MPS），Windows `scripts/setup-muscriptor.ps1`（CUDA PyTorch）。
- **HuggingFace 登录**：权重（CC BY-NC 4.0，非商用）要登录 HuggingFace、在模型页接受许可才能下载。纯蓝不经手 token：界面只显示登录命令（引擎自带的 `hf auth login`），作者在终端里输入 token；纯蓝只检查 token 文件或 `HF_TOKEN` 在不在。
- **输入**：在曲目页选一条或几条 stem；几条时先用 ffmpeg 混成一条（16kHz 单声道，MuScriptor 本来就按这个读）。不提供「整首歌」这个选项。
- **乐器**：每次只选**一个** MuScriptor 乐器组（`--instruments` 只给这一个），输出因此是**单轨** MIDI。默认按所选的轨猜：只选人声 → `voice`，只选贝斯 → `electric_bass`，只选吉他 → `acoustic_guitar`，只选鼓 → `drums`，其余 → `acoustic_piano`；作者手动改过就不再自动换。
- **执行**：普通异步函数 `66CCFF.startTranscription`，和分离一样：进度经 runId 事件推给界面、并定期写进记录；前端可以取消。包装脚本 `scripts/transcribe_muscriptor.py` 做的事和 `muscriptor transcribe` 一样（检测节拍、写进 MIDI），只是把转写进度（第几块 / 共几块）按行打印成 JSON。
- **结果**：新表 `transcription`（迁移 `0002_transcription`）记每次转写的轨、乐器、状态、进度、音符数、BPM；MIDI 存在 `tracks/<曲目>/midi/<转写 id>.mid`，删曲目时一起删。曲目页列出所有结果，可以「在卷帘中打开」或删除。
- 同一首曲目上，分离和转 MIDI 不能同时跑（重新分离会换掉分轨文件）。

## 考虑过、没有采用

- **继续用 Basic Pitch**：作者听感明显不如 MuScriptor。
- **不限制乐器、让 MuScriptor 自己判断**：效果可能更好（ThinkBook 上伴奏转出 4 轨），但输出是多轨，和 user spec「输出一个单轨 MIDI」不一致；要不要放开等作者决定。
- **用 `uvx muscriptor` 临时环境**：每次启动都要解析环境，也不好检测「装没装」；应用管理的 venv 和分离引擎一致。
- **直接调用 `muscriptor transcribe` 命令**：MIDI 模式下不输出进度，界面只能干等。
- **纯蓝里输入 / 保存 HuggingFace token**：密钥不应经过应用界面；以后需要时再接平台的凭据保管（D-0075）。

## 代价

- 引擎约 730MB（主要是 PyTorch），权重 1.23GB；第一次转写要先下载权重。
- 作者要先在浏览器里接受许可、在终端登录一次。
- 包装脚本用到 MuScriptor 的 Python 接口（`TranscriptionModel`、`detect_beat_grid_for`、`events_to_midi_bytes`），升级 MuScriptor 时要核对；所以版本固定在 0.4.0。
- Windows 安装脚本还没在 ThinkBook 上跑过。

## 什么时候应该重新考虑

- 作者想要多乐器（多轨）的转写结果；
- MuScriptor 出了明显更好的版本，或有更好的转写模型；
- 想在应用里调节拍、量化等参数（`--bpm`、`--quantize` 等）。

## 修订记录

- 2026-11-09：删除旧的 Basic Pitch 安装与转写脚本（`setup-midi-engine.ps1`、`transcribe_midi.py`）；应用已不再使用，留着只会让人以为还有两套转写（agent 决定）。已经装在 ThinkBook 上的 `midi-engine` 目录不再被用到，可以手动删。
