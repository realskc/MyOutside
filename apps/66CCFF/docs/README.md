# 纯蓝（66CCFF）技术文档

> 应用 id `66CCFF`。作者预期见 [`../user-spec/README.md`](../user-spec/README.md)；应用决策见 [`../user-spec/decisions/README.md`](../user-spec/decisions/README.md)；外部资料线索见 [`../references/README.md`](../references/README.md)。

## 1. 组成

- **后端**：`backend/src/index.ts` 的 `createX66CCFFApp({ dataDir, engineDir? })`（宿主在启动时用数据目录构造并注册）；`roformer.ts` 负责引擎探测、音频转 WAV 与分离进程。
- **界面**：`ui/` 静态 HTML / CSS / JS（零构建）。
- **引擎**：`scripts/setup-engine.ps1`（Windows）或 `scripts/setup-engine-macos.sh`（macOS）安装到 `<userData>/apps/66CCFF/roformer-engine`（Python 3.12 venv + `bs-roformer-infer` + PyTorch + BS-RoFormer SW 六轨模型；见 [66CCFF-0003](../user-spec/decisions/66CCFF-0003-engine-setup-script.md)、[66CCFF-0008](../user-spec/decisions/66CCFF-0008-bs-roformer-engine.md)、[66CCFF-0009](../user-spec/decisions/66CCFF-0009-macos-source-install.md)）。
- **MIDI 引擎（可选）**：`scripts/setup-midi-engine.ps1` 安装到 `<userData>/apps/66CCFF/midi-engine`（独立 Python 3.10 venv + Basic Pitch + ONNX Runtime；见 [66CCFF-0007](../user-spec/decisions/66CCFF-0007-basic-pitch-midi.md)）；`scripts/transcribe_midi.py` 负责单音频（单条 stem 或选定 stem 混合）转 MIDI。
- **媒体**：宿主 `media://<appId>/<相对路径>` 协议读取 `<userData>/apps/<appId>/`（见 [66CCFF-0004](../user-spec/decisions/66CCFF-0004-app-files-and-media-protocol.md)）。

## 2. 数据

```
app_66CCFF__track(id, title, file, ext, size, duration, created_at)
app_66CCFF__job(id, track_id, status, progress, message, error, created_at, updated_at)
app_66CCFF__stem(id, track_id, job_id, kind, file, size, created_at)
```

- `file` 是相对应用文件根的路径；曲目在 `tracks/<id>/source.<ext>`，六轨在 `tracks/<id>/stems-<jobId>/<kind>.flac`（每次分离独立目录，成功后切换引用并清理旧目录）；
- 同一曲目同一时间只允许一个 `running` 任务；重新分离会替换旧的 stem 记录与文件；
- 删除曲目会删除数据库记录和 `tracks/<id>` 目录。

## 3. API

| 函数 | 类型 | 说明 |
|---|---|---|
| `66CCFF.listTracks` | 只读 | 曲目列表 + 最新任务状态 / 轨数 |
| `66CCFF.getTrack` | 只读 | 曲目详情 + stems + 最新任务 |
| `66CCFF.getEngineStatus` | 只读 | 引擎目录 / Python / 安装提示 |
| `66CCFF.importTrack` | 内部异步 | 校验并复制音频、ffprobe 时长，事务写入 |
| `66CCFF.startSeparation` | 内部异步 | 创建任务、运行 BS-RoFormer、进度事件、事务写六轨 |
| `66CCFF.deleteTrack` | 内部异步 | 事务删除记录 + 删除文件目录 |
| `insertTrack` / `insertJob` / `updateJob` / `finishJob` / `deleteTrackTx` | 内部事务 | 供异步函数使用 |

- `startSeparation` 用 `runId` 推送 `{ type: "progress", progress, message }`；取消用 `bridge.cancel(runId)`（见 [66CCFF-0006](../user-spec/decisions/66CCFF-0006-separation-job-execution.md)）。
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
- Basic Pitch：ONNX 模型 230,444 字节（0.22MB），约 3.6 万个 ONNX 初始化器元素（float32 约 3.57 万个）；独立 MIDI 引擎约 423MB，主要是 ONNX Runtime、scipy、llvmlite、librosa 等依赖。

## 5. MIDI 转写（验证）

- 引擎：Spotify Basic Pitch `0.4.0`，独立 Python 3.10 venv + ONNX Runtime；不安装 TensorFlow，也不与分离引擎的 Python 3.12 环境混用；
- 安装：`powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-midi-engine.ps1`；
- 转写：`apps/66CCFF/scripts/transcribe_midi.py <音频> <输出.mid>`，可选 `--instrument-name`、`--program`、`--min-frequency`、`--max-frequency`、阈值参数；
- 输入只接受**一个音频文件**；可以是单条 stem，也可以是选定的几条 stem 混合；不转整首歌；输出一个单轨 MIDI；鼓轨没有音高，不转；
- 脚本 stdout 输出 JSON 摘要（音符数、音高范围、时长、输出路径），供后续后端接入；
- 验证：2026-11-06 在 `htdemucs_6s` 的 piano stem 上得到 1,131 个音符，guitar stem 上得到 880 个音符；2026-11-07 在 BS-RoFormer SW 的 piano stem 上得到 1,436 个音符，guitar stem 上得到 771 个音符；音符数量不代表质量，作者反馈转写效果仍然一般；冷启动约 20 秒（模型加载），预热后约 5 秒；输出在 `tracks/<id>/midi-validation/`（尚未写入数据库、尚未接入界面）；
- Basic Pitch 以 Apache-2.0 发布；若随应用分发，需要保留 LICENSE / NOTICE。

## 6. 界面

- 左侧曲目列表（时长、任务状态、轨数）；右侧分离面板与播放器；
- 引擎缺失时显示安装命令与「重新检查」；
- 六轨混音：每轨静音 / 独奏 / 音量；同一轨的 M 与 S 互斥（开启一个自动关闭另一个）；
- 播放 / 暂停按钮用图标切换（播放三角 / 暂停条），播放中按钮颜色加深；进度条、速度 50%–100%（保持音高）、循环与 AB 段、清除；空格键暂停 / 继续（文字输入框聚焦时除外）；
- 播放用多个 `<audio>` 元素同步，主轨 `timeupdate` 定期校正其它轨；无波形（v1）。

## 7. 已知限制

- MIDI 转写目前只有命令行验证，没有界面 / API；输出单轨 MIDI，未做 MIDI 播放或多轨合并。
- 取消只对当前页面发起的任务有效；刷新后正在运行的任务无法从界面取消（会继续并靠轮询显示）。
- 没有导出、变调、两轨快捷预设、波形；这些见应用 user spec 的「未定 / 非目标」。
- `media://` 没有跨应用权限：目前任意子应用理论上能猜到并读取其它应用的 media 路径；builder / 不可信应用出现前必须收紧（66CCFF-0004）。
- 分离安装脚本覆盖 Windows / macOS；Linux 需要另行安装。MIDI 安装脚本目前只有 Windows 版本（66CCFF-0003、66CCFF-0007、66CCFF-0009）。
- 分离依赖系统 `ffmpeg` / `ffprobe`；Windows 使用 CUDA，macOS 使用 CPU，Mac 会比 GPU 明显慢。
- 如果从 Finder 启动 Electron，Homebrew 的 `ffmpeg` 可能不在 PATH 中；后端会补查 `/opt/homebrew/bin`、`/usr/local/bin`、`/opt/local/bin`，也可用 `FFMPEG_PATH` / `FFPROBE_PATH` 指定。
