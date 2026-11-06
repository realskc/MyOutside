# 决策（66CCFF）

这里记录**纯蓝应用专属**的决策；全局 / 跨应用的决策在 [`user-spec/decisions/`](../../../../user-spec/decisions/)（`D-NNNN`）。应用 spec 见 [`../README.md`](../README.md)；技术文档见 [`../../docs/README.md`](../../docs/README.md)。

## 约定

- 一条决策一个文件：`66CCFF-NNNN-简短英文标识.md`，编号四位、递增、永不复用；
- 引用写法：`66CCFF-0001`，同一目录内用相对链接；
- 状态：`有效` / `已取代（→ 66CCFF-xxxx）` / `已废弃`；决策文件不删除；
- 决策者：`作者` / `讨论` / `agent`；
- 模板、推翻与「什么时候应该重新考虑」的写法沿用全局规则。

## 索引

| 编号 | 标题 | 状态 |
|---|---|---|
| [66CCFF-0001](66CCFF-0001-six-stem-engine.md) | 六轨分离引擎：Demucs v4 `htdemucs_6s`，本地 CUDA | 有效 |
| [66CCFF-0002](66CCFF-0002-in-app-slow-player.md) | 内建慢放播放器，不依赖 Audacity | 有效 |
| [66CCFF-0003](66CCFF-0003-engine-setup-script.md) | 首版引擎用仓库脚本安装，应用检测状态 | 有效 |
| [66CCFF-0004](66CCFF-0004-app-files-and-media-protocol.md) | 应用文件放 `<userData>/apps/66CCFF`，用 `media://` 提供给界面 | 有效 |
| [66CCFF-0005](66CCFF-0005-identity.md) | 应用标识：id `66CCFF`，中文名「纯蓝」，英文名 66CCFF | 有效 |
| [66CCFF-0006](66CCFF-0006-separation-job-execution.md) | 分离任务：内部异步 API + runId 事件 / 取消 | 有效 |
| [66CCFF-0007](66CCFF-0007-basic-pitch-midi.md) | MIDI 转写：Basic Pitch，独立 Python 3.10 + ONNX，单音频输入 | 有效（引擎已安装；界面 / API 待接入） |
