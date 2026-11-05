# 纯蓝（pureblue）技术文档

> 应用 id `pureblue`。作者预期见 [`../user-spec/README.md`](../user-spec/README.md)；应用决策见 [`../user-spec/decisions/README.md`](../user-spec/decisions/README.md)。

## 1. 组成

- **后端**：`backend/src/index.ts` 的 `createPureblueApp({ dataDir, engineDir? })`（宿主在启动时用数据目录构造并注册）；`demucs.ts` 负责引擎探测与分离进程。
- **界面**：`ui/` 静态 HTML / CSS / JS（零构建）。
- **引擎**：`scripts/setup-engine.ps1` 安装到 `<userData>/apps/pureblue/engine`（Python 3.12 venv + Demucs + CUDA PyTorch；见 [PB-0003](../user-spec/decisions/PB-0003-engine-setup-script.md)）。
- **媒体**：宿主 `media://<appId>/<相对路径>` 协议读取 `<userData>/apps/<appId>/`（见 [PB-0004](../user-spec/decisions/PB-0004-app-files-and-media-protocol.md)）。

## 2. 数据

```
pureblue__track(id, title, file, ext, size, duration, created_at)
pureblue__job(id, track_id, status, progress, message, error, created_at, updated_at)
pureblue__stem(id, track_id, job_id, kind, file, size, created_at)
```

- `file` 是相对应用文件根的路径；曲目在 `tracks/<id>/source.<ext>`，六轨在 `tracks/<id>/stems-<jobId>/<kind>.mp3`（每次分离独立目录，成功后切换引用并清理旧目录）；
- 同一曲目同一时间只允许一个 `running` 任务；重新分离会替换旧的 stem 记录与文件；
- 删除曲目会删除数据库记录和 `tracks/<id>` 目录。

## 3. API

| 函数 | 类型 | 说明 |
|---|---|---|
| `pureblue.listTracks` | 只读 | 曲目列表 + 最新任务状态 / 轨数 |
| `pureblue.getTrack` | 只读 | 曲目详情 + stems + 最新任务 |
| `pureblue.getEngineStatus` | 只读 | 引擎目录 / Python / 安装提示 |
| `pureblue.importTrack` | 内部异步 | 校验并复制音频、ffprobe 时长，事务写入 |
| `pureblue.startSeparation` | 内部异步 | 创建任务、运行 Demucs、进度事件、事务写六轨 |
| `pureblue.deleteTrack` | 内部异步 | 事务删除记录 + 删除文件目录 |
| `insertTrack` / `insertJob` / `updateJob` / `finishJob` / `deleteTrackTx` | 内部事务 | 供异步函数使用 |

- `startSeparation` 用 `runId` 推送 `{ type: "progress", progress, message }`；取消用 `bridge.cancel(runId)`（见 [PB-0006](../user-spec/decisions/PB-0006-separation-job-execution.md)）。
- 所有 API 目前是内部 API；将来给 agent 用时按需公开并声明权限。

## 4. 引擎与分离

- 命令：`python -m demucs --name htdemucs_6s --out <jobDir> --mp3 --mp3-bitrate 192 --jobs 1 <source>`；
- 环境：模型走 HuggingFace 缓存（默认在用户目录，可与其它工具复用）；首次运行会下载模型；
- 进度：解析 stderr / stdout 的百分比行，节流后写任务记录并推送事件；
- 取消：终止子进程，任务标记 `cancelled`；
- 失败：任务标记 `failed` 并保留最后一段错误；页面刷新后靠列表 / 详情轮询恢复显示。
- 遗留任务：应用关闭 / 崩溃后留在 `running` 的任务，超过 1 小时在读取时显示为失败；重新分离或删除时会正式标记为失败（避免永久卡住）。

## 5. 界面

- 左侧曲目列表（时长、任务状态、轨数）；右侧分离面板与播放器；
- 引擎缺失时显示安装命令与「重新检查」；
- 六轨混音：每轨静音 / 独奏 / 音量；播放 / 暂停、进度条、速度 50%–100%（保持音高）、循环与 AB 段、清除；
- 播放用多个 `<audio>` 元素同步，主轨 `timeupdate` 定期校正其它轨；无波形（v1）。

## 6. 已知限制

- 取消只对当前页面发起的任务有效；刷新后正在运行的任务无法从界面取消（会继续并靠轮询显示）。
- 没有导出、变调、两轨快捷预设、波形；这些见应用 user spec 的「未定 / 非目标」。
- `media://` 没有跨应用权限：目前任意子应用理论上能猜到并读取其它应用的 media 路径；builder / 不可信应用出现前必须收紧（PB-0004）。
- 引擎安装脚本只有 Windows 版本；macOS / Linux 需要另行安装（PB-0003）。
