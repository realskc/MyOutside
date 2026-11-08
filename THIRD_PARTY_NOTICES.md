# Third-party notices

MyOutside 自己的代码按 [Apache-2.0](LICENSE) 发布。这个文件记录第三方代码、模型权重和外部工具的许可证情况；它不改变各项目自己的许可证，也不是法律意见。

> 最近核对：2026-11-08。许可证会变化，正式分发前请重新核对上游文件和模型卡。

## 当前运行时会用到的组件

### bs-roformer-infer

- 用途：纯蓝调用 BS-RoFormer 分离模型。
- 代码许可证：MIT。
- 来源：<https://github.com/openmirlab/bs-roformer-infer>
- 当前固定版本：0.1.6（git commit `95c8de7b0b091d00f064d694bf916a21866c32f5`）。

### BS-RoFormer SW 6-stem 权重

- 用途：纯蓝的六轨分离权重。
- 上游：[`enerjazzer/BS-ROFO-SW-Fixed`](https://huggingface.co/enerjazzer/BS-ROFO-SW-Fixed)。
- 镜像：[`FractalSurfer/BS-RoFormer-SW-6stem`](https://huggingface.co/FractalSurfer/BS-RoFormer-SW-6stem)。
- 许可证：**unknown / 未声明**。HuggingFace 模型卡标记为 `license: unknown`；镜像明确说明它不授予额外权利，并要求联系原作者确认使用条款。
- 当前处理：模型不提交进仓库，由用户的安装脚本运行时下载。
- 注意：代码 MIT 只覆盖 `bs-roformer-infer`，不覆盖权重。公开分发或商业使用前必须确认权重的授权。

### PyTorch

- 用途：`bs-roformer-infer` 的推理运行时。
- 许可证：BSD-3-Clause。
- 来源：<https://github.com/pytorch/pytorch>
- Windows 安装 CUDA 版；macOS 安装 CPU 版。

### Basic Pitch

- 用途：当前可选的音频转 MIDI 引擎。
- 项目：Spotify Basic Pitch 0.4.0。
- 许可证：Apache-2.0。
- 来源：<https://github.com/spotify/basic-pitch>
- 分发时需要保留上游的 LICENSE / NOTICE。

### ffmpeg / ffprobe

- 用途：分离前把输入格式统一为 44.1kHz 立体声 WAV，以及读取音频时长。
- 当前处理：作为系统外部命令调用，不随仓库分发。
- 许可证：取决于具体构建；可能是 LGPL-2.1-or-later，也可能因为启用 GPL 组件而成为 GPL。分发打包版本前必须检查实际构建的许可证。

### Electron 和 JavaScript 依赖

- 依赖清单见各 `package.json` 和 `pnpm-lock.yaml`。
- Electron 使用 MIT；其他直接/间接依赖各有自己的许可证。
- `@tonejs/midi`：MIT，用于纯蓝 MIDI 卷帘解析 MIDI 文件。
- 正式分发前应生成完整的第三方许可证清单，而不是只依赖本文件。

## 研究过但尚未集成的 MIDI 候选

以下项目目前没有进入纯蓝的正式运行路径；列出它们是为了以后接入时不要误用许可证。

### MuScriptor

- 代码：MIT。
- 权重：**CC BY-NC 4.0（非商业）**。
- 来源：<https://github.com/muscriptor/muscriptor>
- 权重：<https://huggingface.co/MuScriptor>
- 说明：代码许可证不覆盖权重；商业化或公开分发前需要单独确认。用户自己下载权重也不自动解决“商业使用”限制。

### YourMT3+

- 代码：GitHub 标 GPL-3.0。
- 权重：HuggingFace 标 Apache-2.0。
- 来源：<https://github.com/mimbres/YourMT3>
- 说明：两处许可证不一致，正式集成前必须向作者确认；如果按 GPL-3.0 处理，会带来 copyleft 义务。

### mt3-infer

- 代码/包：MIT（GitHub API 显示 NOASSERTION，需以仓库 LICENSE 为准）。
- 来源：<https://github.com/openmirlab/mt3-infer>
- 说明：它只是推理封装，不改变所加载模型的许可证；它还 vendor 了其他项目，需要逐项检查。

### MR-MT3

- 代码：MIT。
- 权重：HuggingFace 标 MIT。
- 来源：<https://github.com/gudgud96/MR-MT3>
- 说明：许可证看起来较友好，但本项目尚未实测和集成。

### MT3-PyTorch

- 代码/权重：上游没有明确的许可证声明。
- 来源：<https://github.com/kunato/mt3-pytorch>
- 说明：未声明许可证不等于可以自由分发；当前不纳入正式依赖。

### 钢琴专用候选

- **Transkun**：参考仓库标注 MIT；接入前仍需核对权重本身。
- **ByteDance Piano Transcription**：许可证和权重条款待核实。
- 这些项目尚未集成。

### Music-to-MIDI（mason369）

- 类型：下游整合项目，不是模型官方仓库。
- 许可证待核实；当前只作为工程参考。

## 模型输出

模型生成的 MIDI / 音频输出是否受额外限制，取决于模型条款和适用法律；不要因为“输出是生成的”就假设它可以无条件用于商业分发。正式商用前请单独确认。

## 维护规则

- 新增第三方代码、模型权重或外部工具时，必须在这个文件补一条记录；
- 记录代码许可证和权重许可证，不能混为一谈；
- 模型权重优先运行时下载，不提交进仓库；
- 公开分发 / 商业使用前重新核对上游许可证，并保留对应的 LICENSE / NOTICE。
