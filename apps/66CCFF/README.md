# 纯蓝（66CCFF）

六轨分离 + 内建慢放播放器，用于学音乐时听清、放慢、循环练习；另有 MIDI 卷帘，用于对比不同转写结果并做基础试听。

- 作者预期：[`user-spec/README.md`](user-spec/README.md)
- 技术文档：[`docs/README.md`](docs/README.md)
- 决策：[`user-spec/decisions/README.md`](user-spec/decisions/README.md)
- 外部资料线索：[`references/README.md`](references/README.md)

## 首次使用（Windows / macOS）

需要先安装 [uv](https://docs.astral.sh/uv/)、`ffmpeg` 和 `git`。

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-engine.ps1
```

脚本会创建 Python 3.12 venv，安装 `bs-roformer-infer` + CUDA 版 PyTorch，并预下载 BS-RoFormer SW 六轨模型（首次下载约数 GB；模型约 667MB）。

### macOS

```bash
brew install uv ffmpeg git
bash apps/66CCFF/scripts/setup-engine-macos.sh
```

macOS 没有 CUDA，且 `bs-roformer-infer` 不支持 MPS，因此分离会走 CPU；同一首歌会明显比 Windows + RTX 5060 慢，可能达到几分钟。脚本会安装 CPU 版 PyTorch、`bs-roformer-infer` 和 BS-RoFormer SW 模型。

### MIDI 转写（可选，单音频）

MIDI 引擎目前只有 Windows 安装脚本：

```powershell
powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-midi-engine.ps1
```

脚本会创建**独立**的 Python 3.10 venv，安装 Basic Pitch + ONNX Runtime，不安装 TensorFlow，也不影响上面的分离引擎。可以转单条 stem，也可以把选定的几条 stem 混成一条音频再转；不转整首歌。

应用文件（曲目、六轨结果、引擎、MIDI 引擎）位于：

- Windows：`%APPDATA%/MyOutside/apps/66CCFF/`
- macOS：`~/Library/Application Support/MyOutside/apps/66CCFF/`

还需要 Node.js 24+ 和 pnpm（见仓库根 README）。装好引擎后，在仓库根目录运行：

```bash
pnpm install
pnpm dev
```

## 开发

- 数据库迁移与 API：`backend/src/index.ts`
- 引擎调用与进度：`backend/src/roformer.ts`
- MIDI 单音频转写：`scripts/transcribe_midi.py`（需要 `setup-midi-engine.ps1` 安装的独立引擎；输入可以是单条 stem 或选定 stem 的混合）
- 界面：`ui/`（零构建静态页面）
- 测试：`pnpm.cmd --filter @myoutside/66ccff test`
