# 纯蓝（66CCFF）

六轨分离 + 内建慢放播放器，用于学音乐时听清、放慢、循环练习。

- 作者预期：[`user-spec/README.md`](user-spec/README.md)
- 技术文档：[`docs/README.md`](docs/README.md)
- 决策：[`user-spec/decisions/README.md`](user-spec/decisions/README.md)
- 外部资料线索：[`references/README.md`](references/README.md)

## 首次使用（Windows）

需要先安装 [uv](https://docs.astral.sh/uv/)，然后运行一次：

```powershell
powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-engine.ps1
```

脚本会创建 Python 3.12 venv，安装 Demucs + CUDA 版 PyTorch，并预下载 `htdemucs_6s` 六轨模型（首次下载约数 GB）。

### MIDI 转写（可选，单音频）

需要把某条 stem 转成 MIDI 时，再运行一次：

```powershell
powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-midi-engine.ps1
```

脚本会创建**独立**的 Python 3.10 venv，安装 Basic Pitch + ONNX Runtime，不安装 TensorFlow，也不影响上面的 Demucs 引擎。可以转单条 stem，也可以把选定的几条 stem 混成一条音频再转；不转整首歌。

应用文件（曲目、六轨结果、引擎、MIDI 引擎）位于 `%APPDATA%/MyOutside/apps/66CCFF/`。

## 开发

- 数据库迁移与 API：`backend/src/index.ts`
- 引擎调用与进度：`backend/src/demucs.ts`
- MIDI 单音频转写：`scripts/transcribe_midi.py`（需要 `setup-midi-engine.ps1` 安装的独立引擎；输入可以是单条 stem 或选定 stem 的混合）
- 界面：`ui/`（零构建静态页面）
- 测试：`pnpm.cmd --filter @myoutside/66ccff test`
