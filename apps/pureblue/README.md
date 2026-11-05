# 纯蓝（pureblue / 0x66CCFF）

六轨分离 + 内建慢放播放器，用于学音乐时听清、放慢、循环练习。

- 作者预期：[`user-spec/README.md`](user-spec/README.md)
- 技术文档：[`docs/README.md`](docs/README.md)
- 决策：[`user-spec/decisions/README.md`](user-spec/decisions/README.md)

## 首次使用（Windows）

需要先安装 [uv](https://docs.astral.sh/uv/)，然后运行一次：

```powershell
powershell -ExecutionPolicy Bypass -File apps/pureblue/scripts/setup-engine.ps1
```

脚本会创建 Python 3.12 venv，安装 Demucs + CUDA 版 PyTorch，并预下载 `htdemucs_6s` 六轨模型（首次下载约数 GB）。

应用文件（曲目、六轨结果、引擎）位于 `%APPDATA%/MyOutside/apps/pureblue/`。

## 开发

- 数据库迁移与 API：`backend/src/index.ts`
- 引擎调用与进度：`backend/src/demucs.ts`
- 界面：`ui/`（零构建静态页面）
- 测试：`pnpm.cmd --filter @myoutside/pureblue test`
