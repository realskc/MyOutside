# 纯蓝（66CCFF）技术文档

> 应用 id `66CCFF`。作者预期见 [`../user-spec/README.md`](../user-spec/README.md)；应用决策见 [`../user-spec/decisions/README.md`](../user-spec/decisions/README.md)；外部资料线索见 [`../references/README.md`](../references/README.md)。

## 1. 组成

- **后端**：`backend/src/index.ts` 的 `createX66CCFFApp({ dataDir, engineDir?, transcriptionEngineDir?, gameEngineDir?, scriptsDir? })`（宿主在启动时用数据目录和仓库里的 `apps/66CCFF/scripts` 构造并注册）；`process.ts` 是引擎 Python 探测和子进程；`roformer.ts` 负责音频转 WAV 与分离进程；`transcription.ts` 负责混合 stem 与转写进程（MuScriptor / GAME）。
- **界面**：`ui/` 静态 HTML / CSS / JS（零构建）。
- **引擎**：`scripts/setup-engine.ps1`（Windows）或 `scripts/setup-engine-macos.sh`（macOS）安装到 `<userData>/apps/66CCFF/roformer-engine`（Python 3.12 venv + `bs-roformer-infer` + PyTorch + BS-RoFormer SW 六轨模型；见 [66CCFF-0003](../user-spec/decisions/66CCFF-0003-engine-setup-script.md)、[66CCFF-0008](../user-spec/decisions/66CCFF-0008-bs-roformer-engine.md)、[66CCFF-0009](../user-spec/decisions/66CCFF-0009-macos-source-install.md)）。
- **转 MIDI 引擎**：`scripts/setup-muscriptor-macos.sh`（macOS）或 `scripts/setup-muscriptor.ps1`（Windows）安装到 `<userData>/apps/66CCFF/muscriptor-engine`（Python 3.12 venv + MuScriptor 0.4.0 + PyTorch；权重缓存在 `models/`，要先登录 HuggingFace；见 [66CCFF-0012](../user-spec/decisions/66CCFF-0012-muscriptor-in-app-transcription.md)）；`scripts/transcribe_muscriptor.py` 是应用调用的包装脚本（检测节拍、写 MIDI、逐行打印 JSON 进度）。
- **人声转 MIDI 引擎（GAME）**：`scripts/setup-game-macos.sh`（macOS）或 `scripts/setup-game.ps1`（Windows）安装到 `<userData>/apps/66CCFF/game-engine`（Python 3.12 venv + PyTorch + GAME 依赖 + beat_this；`GAME/` 是 v1.0.3 的代码；`models/GAME-1.0-large/` 是权重；不用登录；见 [66CCFF-0017](../user-spec/decisions/66CCFF-0017-game-vocal-midi.md)）；`scripts/transcribe_game.py` 是包装脚本。
- **媒体**：宿主 `media://<appId>/<相对路径>` 协议读取 `<userData>/apps/<appId>/`（见 [66CCFF-0004](../user-spec/decisions/66CCFF-0004-app-files-and-media-protocol.md)）。

## 2. 数据

```
app_66CCFF__track(id, title, file, ext, size, duration, created_at)
app_66CCFF__job(id, track_id, status, progress, message, error, created_at, updated_at)
app_66CCFF__stem(id, track_id, job_id, kind, file, size, created_at)
app_66CCFF__transcription(id, track_id, stems, instrument, model, status, progress, message, error, file, note_count, bpm, created_at, updated_at)
```

- `file` 是相对应用文件根的路径；曲目在 `tracks/<id>/source.<ext>`，六轨在 `tracks/<id>/stems-<jobId>/<kind>.flac`（每次分离独立目录，成功后切换引用并清理旧目录）；
- 同一曲目同一时间只允许一个 `running` 任务；重新分离会替换旧的 stem 记录与文件；
- 转 MIDI 的结果在 `tracks/<id>/midi/<转写 id>.mid`；`stems` 是所选 stem 的 JSON 数组；迁移 `0002_transcription` 建表（66CCFF-0012）；引擎不单独存：`model` 以 `game-` 开头的是 GAME（`game-large`），其余是 MuScriptor（`medium`），接口返回 `engine`（66CCFF-0017）；
- 同一曲目上分离和转 MIDI 不能同时跑；
- 删除曲目会删除数据库记录（含转写记录）和 `tracks/<id>` 目录。

## 3. API

| 函数 | 类型 | 说明 |
|---|---|---|
| `66CCFF.listTracks` | 只读 | 曲目列表 + 最新任务状态 / 轨数 |
| `66CCFF.getTrack` | 只读 | 曲目详情 + stems + 最新任务 |
| `66CCFF.getEngineStatus` | 只读 | 引擎目录 / Python / 安装提示 |
| `66CCFF.readMidi` | 只读 | 读取本地 `.mid` / `.midi`，返回秒制音符、轨道（含是否鼓轨 `percussion`）和按速度表算好的拍 / 小节 `grid`；时间都是原音频的时间（MuScriptor 的 `bar_offset` 延后已减掉，66CCFF-0016）；供钢琴卷帘使用 |
| `66CCFF.readTranscription` | 只读 | 读取一次转写的 MIDI，格式同 `readMidi` |
| `66CCFF.getTranscriptionEngineStatus` | 只读 | 转 MIDI 引擎是否安装、是否已登录 HuggingFace、安装 / 登录命令、可选乐器 |
| `66CCFF.startTranscription` | 内部异步 | 所选 stem（多条先混合）→ MuScriptor（一个乐器）→ 单轨 MIDI；进度事件 + 写进记录 |
| `66CCFF.deleteTranscription` | 内部异步 | 删除转写记录和 MIDI 文件 |
| `66CCFF.importTrack` | 内部异步 | 校验并复制音频、ffprobe 时长，事务写入 |
| `66CCFF.startSeparation` | 内部异步 | 创建任务、运行 BS-RoFormer、进度事件、事务写六轨 |
| `66CCFF.deleteTrack` | 内部异步 | 事务删除记录 + 删除文件目录 |
| `insertTrack` / `insertJob` / `updateJob` / `finishJob` / `deleteTrackTx` / `insertTranscription` / `updateTranscription` / `finishTranscription` / `deleteTranscriptionTx` | 内部事务 | 供异步函数使用 |

- `startSeparation`、`startTranscription` 用 `runId` 推送 `{ type: "progress", progress, message }`；取消用 `bridge.cancel(runId)`（见 [66CCFF-0006](../user-spec/decisions/66CCFF-0006-separation-job-execution.md)）。
- 所有 API 目前是内部 API；将来给 agent 用时按需公开并声明权限。

## 4. 引擎与分离

- 输入：先用 `ffmpeg` 转成 44.1kHz 立体声 WAV（`bs-roformer-infer` 只接受 WAV）；
- 命令：`python -m bs_roformer.inference --model roformer-model-bs-roformer-sw-by-jarredou --models_dir <engine>/models --input_folder <jobDir>/input --store_dir <jobDir>/stems --output_format flac16 --device <cuda|cpu>`；
- 设备：Windows 默认 `cuda`，macOS 默认 `cpu`（无 CUDA；`bs-roformer-infer` 不支持 MPS）；可用 `MYOUTSIDE_SEPARATION_DEVICE` 覆盖；
- 环境：模型在 `<userData>/apps/66CCFF/roformer-engine/models`；首次运行会下载模型；
- 进度：解析 `Estimated total processing time` / `Estimated time remaining` 行估算百分比，节流后写任务记录并推送事件；
- 取消：终止子进程，任务标记 `cancelled`；
- 失败：任务标记 `failed` 并保留最后一段错误；页面刷新后靠列表 / 详情轮询恢复显示。
- 遗留任务：应用关闭 / 崩溃后留在 `running` 的任务，超过 1 小时在读取时显示为失败；重新分离或删除时会正式标记为失败（避免永久卡住）。

### 模型与体积

- BS-RoFormer SW 六轨权重 `BS-Rofo-SW-Fixed.ckpt`：约 667MB；实际推理在 RTX 5060 上处理 3 分 02 秒歌曲约 36 秒。
- 引擎体积主要来自 PyTorch；当前测试环境通过独立 `roformer-engine` venv 安装 `bs-roformer-infer`。Windows 使用 CUDA 版 PyTorch，macOS 使用 CPU 版。
- MuScriptor `medium` 权重 1.23GB；转 MIDI 引擎（Python 3.12 venv + PyTorch）在 macOS 上约 730MB。
- GAME large 权重约 380MB（压缩包约 350MB）；beat_this 的 `final0`（约 80MB）在 PyTorch 缓存 `~/.cache/torch/hub/checkpoints`，两个引擎共用。

## 5. 转 MIDI（MuScriptor，66CCFF-0012）

- 引擎：MuScriptor 0.4.0、`medium` 权重（1.23GB，CC BY-NC 4.0）；Python 3.12 venv；macOS 自动用 Metal（MPS），Windows 用 CUDA；
- 安装：`bash apps/66CCFF/scripts/setup-muscriptor-macos.sh` 或 `powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-muscriptor.ps1`；
- 登录：先在 huggingface.co/MuScriptor/muscriptor-medium 接受许可，再在终端运行 `<引擎>/venv/bin/hf auth login`（Windows：`venv\Scripts\hf.exe`）；纯蓝只检查 `HF_TOKEN` 或 HuggingFace 的 token 文件在不在，不读也不存 token；
- 流程：界面选 stem（多条先 ffmpeg `amix` 成 16kHz 单声道 WAV）和一个乐器 → `scripts/transcribe_muscriptor.py`（`--instrument <一个乐器组> --model medium --beats-audio <整首歌>`；环境变量 `HF_HUB_CACHE=<引擎>/models`）→ 逐行 JSON：`loading` / `beats` / `transcribing`（completed / total 块）/ `done`（BPM）/ `error`；音符数由纯蓝从写好的 MIDI 里数（66CCFF-0014）；
- 进度映射：加载模型 3%、检测节拍 6%、转写 8%–98%；记录每 0.8 秒最多写一次；
- 节拍在整首歌（曲目的原始音频，先用 ffmpeg 解成 16kHz 单声道 `beats.wav`）上检测，不在所转的 stem 上：同一首歌的每次转写用同一套小节线（66CCFF-0017）；
- 默认乐器：只选人声 → 人声旋律（GAME，见下一节），只选贝斯 → `electric_bass`，只选吉他 → `acoustic_guitar`，只选鼓 → `drums`，其余 → `acoustic_piano`。

## 5.1 人声旋律（GAME，66CCFF-0017）

- 引擎：GAME v1.0.3 + `GAME-1.0-large` 权重（CC BY-NC-SA 4.0）；Python 3.12 venv；macOS 用 MPS，Windows 用 CUDA（Lightning 自动选）；
- 安装：`bash apps/66CCFF/scripts/setup-game-macos.sh` 或 `powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-game.ps1`（Windows 版未实测）；装过的代码和权重会跳过；
- 流程：所选 stem（多条先混成 44.1kHz 单声道）→ `scripts/transcribe_game.py <音频> <输出> --engine <引擎> --beats-audio <整首歌>`：
  - beat_this 在整首歌上检测节拍（纯蓝先用 ffmpeg 把原曲解成 16kHz 单声道的 `beats.wav`，两个引擎用同一个文件）；
  - GAME 的 `extract` 流程在进程里跑（语言 `zh`，一段一批），按切片报 `transcribing`；
  - 写单轨 MIDI：音高取整；恒定速度或每拍一个速度；音符延后到强拍落在小节线上，并写 `muscriptor:bar_offset` marker；
- 只接受 `instrument: voice`；不需要 HuggingFace。

## 5.2 Basic Pitch（已删除）

- 之前在 ThinkBook 上用 Basic Pitch 做过命令行验证（66CCFF-0007），作者反馈效果一般；改用 MuScriptor 后，它的安装与转写脚本已删除（66CCFF-0012 修订记录）。验证数据留在 66CCFF-0007 里。

## 6. 界面

- 左侧曲目列表（时长、任务状态、轨数）；右侧分离面板与播放器；
- 引擎缺失时显示安装命令与「重新检查」；
- 六轨混音：每轨静音 / 独奏 / 音量；同一轨的 M 与 S 互斥（开启一个自动关闭另一个）；
- 播放 / 暂停按钮用图标切换（播放三角 / 暂停条），播放中按钮颜色加深；进度条、速度 50%–100%（保持音高）、循环与 AB 段、清除；空格键暂停 / 继续（文字输入框聚焦时除外）；
- 播放用多个 `<audio>` 元素同步，主轨 `timeupdate` 定期校正其它轨；无波形（v1）。
- 每个 `<audio>` 经 `createMediaElementSource` 接进同一个 `AudioContext` + `GainNode`；静音 / 独奏 / 音量只改音量节点，`<audio>` 本身永远不静音（66CCFF-0011：浏览器会在窗口隐藏时暂停一直静音的 `<audio>`，主轨一停，切回来进度会回退）。冒烟检查 `66CCFF background` / `66CCFF web audio` 守着这两点。
- 钢琴卷帘（66CCFF-0015）：播放器下面的一块面板（`ui/roll.js`，Canvas 2D），时间完全跟着分轨播放器走（跳转、慢放、AB 循环都是播放器的）。自动读这首曲目所有成功的转写结果，也可以手动添加 MIDI 文件（不存）；多轨叠加、每轨一色、图例里开关。
  - 卷帘模式：左边琴键、小节线 / 拍线 / 小节号（后端 `grid`）、块够大时显示音名、悬停信息、点击试听；滚动移动，捏合或 ⌘ + 滚动缩放时间（琴键上缩放音高），⌥ + 滚动缩放音高，工具栏「时间 / 音高 − +」「适应」（大部分音符放进画面）「跟随」。
  - 沉浸模式：铺满窗口，音符往下落到琴键上，小节横线，顶上进度条；Esc 退出。
  - 声音：`ui/midi-synth.js` 合成音，接在混音同一个 `AudioContext` 上，混音里是「MIDI」一轨；按播放器时间每 25 毫秒往后排 0.3 秒（隐藏时 1.6 秒），跳转 / 换速度时重排，等播放器时间走起来再排；鼓轨不发声。
  - 冒烟检查 `66CCFF roll`（读出转写结果、混音里有「MIDI」、进出沉浸模式，截图）和 `66CCFF roll synth`（窗口静音，50% 速度下两个和弦的开始时间相差约 2 秒）。
- 转 MIDI 面板（有分轨时出现）：选 stem（勾选）、选乐器（最前面是「人声旋律（GAME）」，其余是 MuScriptor 的乐器）、「转 MIDI」/「取消」；所选引擎没装或没登录时显示对应命令与「重新检查」；下面列出这首曲目的所有转写结果（乐器 ← 所选的轨、时间、音符数、BPM、进度或失败原因），可以「在卷帘中显示 / 从卷帘隐藏」或删除（66CCFF-0012）。冒烟检查 `66CCFF transcribe panel` 确认面板出现，`66CCFF game choice` 确认只勾人声时默认选 GAME、没装时显示 GAME 的安装命令。

## 7. 已知限制

- 转 MIDI 每次只能选一个乐器（单轨 MIDI）；卷帘的声音是合成音，不是真实钢琴；不能编辑。
- 卷帘的小节线用第一条显示中的轨的 MIDI 速度；66CCFF-0017 之后转的结果都在整首歌上检测节拍，小节线一致；之前在单条 stem 上检测的结果，速度可能不同（66CCFF-0015）。
- GAME 只转单旋律：两人同时唱的地方只出一条；语言固定 `zh`（66CCFF-0017）。
- 卷帘的「添加 MIDI 文件」只在 Electron 宿主可用；LAN / 浏览器版暂不支持。
- 取消只对当前页面发起的任务有效；刷新后正在运行的任务无法从界面取消（会继续并靠轮询显示）。
- 没有导出、变调、两轨快捷预设、波形；这些见应用 user spec 的「未定 / 非目标」。
- `media://` 没有跨应用权限：目前任意子应用理论上能猜到并读取其它应用的 media 路径；builder / 不可信应用出现前必须收紧（66CCFF-0004）。
- 分离与转 MIDI 的安装脚本都覆盖 Windows / macOS（转 MIDI 的 Windows 脚本尚未实测）；Linux 需要另行安装（66CCFF-0003、66CCFF-0009、66CCFF-0012）。
- 分离依赖系统 `ffmpeg` / `ffprobe`；Windows 使用 CUDA，macOS 使用 CPU，Mac 会比 GPU 明显慢。
- 如果从 Finder 启动 Electron，Homebrew 的 `ffmpeg` 可能不在 PATH 中；后端会补查 `/opt/homebrew/bin`、`/usr/local/bin`、`/opt/local/bin`，也可用 `FFMPEG_PATH` / `FFPROBE_PATH` 指定。
