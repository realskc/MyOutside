# MyOutside（中文名：地球online）

跨平台（Windows / Linux / macOS）GUI 宿主应用：按协议装载多个子应用（模拟器式界面）；每个子应用拥有私有数据和公开 API，跨应用通过宿主相互调用并原子地交换数据。

当前状态：**v0 开发中**——宿主 + 内核 + 第一个子应用「学英语」已可用。

建议阅读顺序：

1. `docs/vision.md` — 核心动机与世界观（为什么做 MyOutside）
2. `docs/requirements.md` — 已确认的决策、悬而未决的问题、非目标
3. `docs/protocol-v0.md` — 子应用协议骨架草案（数据读写、跨应用事务、文件仓库、刷新模型）
4. `docs/apps/` — 子应用规格（`vocab.md` = 第一个子应用：学英语应用）
5. `docs/future/` — 未来方向设计（`multi-device.md` = 多端架构：云端内核方案；`one-off-functions.md` = 临时函数）

## 开发

环境：Node 24+、pnpm（由 corepack 提供，Windows 上用 `pnpm.cmd` 调用最稳）。

```powershell
pnpm.cmd install    # 安装依赖
pnpm.cmd test       # 单元 / 集成测试（kernel、vocab、适配器）
pnpm.cmd typecheck  # 全部类型检查
pnpm.cmd simulate   # 模拟「对话应用」经内核调用 vocab（跨应用路径演示）
pnpm.cmd ai:ping    # 用应用数据目录里的 key 做一次真实 AI 调用（验证配置）
pnpm.cmd import:vocabry  # 从旧 Vocabry 库 + Anki 迁移卡片（近似迁移复习状态；可重复运行）
pnpm.cmd dev        # 启动桌面端（Electron 窗口）
pnpm.cmd smoke      # 冒烟测试：自检内核 / 桥 / 子应用 iframe 后自动退出
```

数据位置（开发期）：`%APPDATA%/MyOutside/myoutside.db`；`pnpm.cmd simulate` 用的是仓库内 `data/`。

不想开终端时：双击桌面的 **MyOutside** 快捷方式（静默启动，无控制台），或运行 `scripts/launch/MyOutside.cmd`（带控制台、便于看日志）；快捷方式可用 `scripts/launch/create-shortcut.ps1` 重建。应用带单实例锁，重复双击会聚焦已有窗口。

当前 v0 已实现：宿主（Electron）+ 内核（串行队列、事务、硬所有权、迁移、DataVersion、平台设置、平台 AI 代理）+ 学英语应用（复习（间隔预览 / 完全学会）/ 查词（AI）/ 词库 / 添加（LLM 去重）/ 统计）。
未实现（见 docs）：临时函数、builder、移动端、打包分发。
