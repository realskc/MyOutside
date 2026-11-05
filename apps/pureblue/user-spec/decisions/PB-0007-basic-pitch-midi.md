# PB-0007 MIDI 转写：Basic Pitch，独立 Python 3.10 + ONNX，单音频输入

- 状态：有效（引擎已安装；界面 / API 待接入）
- 日期：2026-11-06
- 决策者：讨论
- 服务于：
  - 作者预期：[`../README.md`](../README.md)「核心流程与预期」可选的 MIDI 转写（单条 stem 或选定 stem 的混合音频）
  - 上游决策：[PB-0003](PB-0003-engine-setup-script.md)（应用管理自己的引擎）

## 背景

作者希望给纯蓝增加「音频转 MIDI」能力，并明确**不把整首歌当输入**；可以在单条 stem 上转写，也可以先把选定的几条 stem（例如钢琴 + 吉他）混成一条音频再转写。纯蓝已经有 Demucs 分出的六条 stem，适合作为转写输入。

Spotify Basic Pitch 是 Apache-2.0 的音频转 MIDI 模型，支持复音和音高弯曲，官方说明「一次一个乐器效果最好」；混合多条 stem 时准确率会下降，这是可选路径而不是首选。

## 决策

- 使用 Basic Pitch `0.4.0`，只接受单个音频文件，输出单个**单轨** `.mid`；输入可以是单条 stem，也可以是选定的几条 stem 混合；不转整首歌、不做多轨合并；
- 使用**独立的** `<userData>/apps/pureblue/midi-engine` 引擎：Python 3.10 + ONNX Runtime，不安装 TensorFlow；
- 不把 Basic Pitch 装进 Demucs 的 Python 3.12 venv：Basic Pitch 官方支持到 Python 3.11，Python 3.11+ 的依赖会拉 TensorFlow `<2.15.1`，而它没有 Python 3.12 的轮子；独立环境也避免和 Demucs 的 numpy / scipy 依赖互相影响；
- 安装脚本：`apps/pureblue/scripts/setup-midi-engine.ps1`；脚本额外安装 `setuptools<81`，因为 Basic Pitch 依赖的 `resampy` 仍导入 `pkg_resources`；
- 转写脚本：`apps/pureblue/scripts/transcribe_midi.py`，stdout 输出 JSON 摘要，便于后续接入异步 API / `runId` 进度；
- 鼓轨不转（Basic Pitch 不是鼓转写模型）；钢琴 / 吉他 / 贝斯 / 人声 / 其他可以单独转，也可以按需混成一条音频后转，并可按乐器设置频率范围；
- 当前验证产物放在 `tracks/<id>/midi-validation/`，不写入数据库；界面接入后再改为正式的 `midi-<jobId>` 目录和记录。

## 验证

- 2026-11-06：在本机 3 分 02 秒的 piano stem 上得到 1,131 个音符，guitar stem 上得到 880 个音符，bass stem 上得到 615 个音符；
- 把 piano + guitar 混成一条音频后得到 1,525 个音符（单轨 MIDI，10,334 字节）；混合后比两条 stem 分别转写少了约 486 个音符，符合「一次一个乐器效果最好」的预期；
- 冷启动（含模型加载）约 20 秒，预热后单条 stem 的 CPU 推理约 5 秒；输出放在该曲目的 `midi-validation/`，尚未写入数据库，也尚未接入界面；未来如果每次启动一次进程，需要接受冷启动或复用模型进程。

## 考虑过、没有采用

- **装进现有 Demucs Python 3.12 venv**：官方不支持 Python 3.12；依赖会拉扯 TensorFlow / numpy / scipy，风险高。
- **Basic Pitch TypeScript 版（`@spotify/basic-pitch`）**：可以避免第二个 Python 环境，但纯蓝界面目前是零构建静态页面，需要额外打包 TensorFlow.js，并且通常在主线程跑；后续如果有浏览器端转写的需求再考虑。
- **直接转整首歌**：Basic Pitch 在复音混音上容易产生大量错误音符；已有六轨时按 stem 转更合理。
- **专门的钢琴转写模型**：如果 Basic Pitch 在钢琴 stem 上的精度不够，再评估更重的专用模型。

## 代价

- MIDI 引擎约 423MB；模型本身只有约 0.22MB，主要体积来自 ONNX Runtime、scipy、llvmlite、librosa；
- CPU 推理；本机 3 分钟左右的单音频约 5 秒；
- 混合多条 stem 会降低转写准确率、漏掉部分音符；单轨转写仍然是首选；
- Basic Pitch 的输出是近似 MIDI，需要试听 / 在 DAW 里检查；没有应用内 MIDI 播放或多轨合并；
- 随应用分发时需要遵守 Apache-2.0，保留 Basic Pitch 的 LICENSE / NOTICE。

## 什么时候应该重新考虑

- 钢琴 / 吉他等单条 stem 的转写质量不够 → 评估专用转写模型；
- 需要在纯蓝内播放 MIDI、显示钢琴卷帘或合并多轨 → 增加 MIDI 播放与多轨 MIDI 写入；
- Basic Pitch 更新 Python 支持或切换运行时 → 重新评估独立 Python 3.10 环境是否仍必要。
