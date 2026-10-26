# MyOutside（中文名：地球online）

跨平台（Windows / Linux / macOS）桌面应用：按协议装载多个子应用；每个子应用拥有私有数据和公开 API，跨应用经内核相互调用并原子地交换数据。

当前状态：**v0 开发中**——Electron 程序 + 内核 + 子应用「学英语」「对话」「围棋」已可用。

文档分两层：

1. `user-spec/` — **作者的预期**（项目的源头）：产品是什么、为谁、什么重要、什么不要；以及 `decisions/`——每个实现选择为什么这样做、什么时候可以推翻。已迁移应用（目前是 `apps/go`）的预期与决策在 `apps/go/user-spec/`。从 `user-spec/README.md` 读起。
2. `docs/` — **技术文档**：当前实现与技术设计（架构与协议、各子应用、未来方向），设计依据引用决策；应用专属技术文档在 `apps/<app>/docs/`。从 `docs/README.md` 读起。

参与开发的 agent 先读 `AGENTS.md`。

## 开发

环境：Node 24+、pnpm（Windows 上用 `pnpm.cmd` 调用最稳；macOS / Linux 直接用 `pnpm`。Node 25 起不再自带 corepack，需要 `npm install -g pnpm`）。

```powershell
pnpm.cmd install    # 安装依赖
pnpm.cmd test       # 单元 / 集成测试（kernel、vocab、适配器）
pnpm.cmd typecheck  # 全部类型检查
pnpm.cmd simulate   # 模拟「对话应用」经内核调用 vocab（跨应用路径演示）
pnpm.cmd ai:ping    # 用应用数据目录里的 key 做一次真实 AI 调用（验证 key、模型与思考强度）
pnpm.cmd import:vocabry  # 从旧 Vocabry 库 + Anki 迁移卡片（近似迁移复习状态；可重复运行）
pnpm.cmd build:toefl # 从《词以类记》分级结果重新生成参考词表数据（源：D:\Resource\TOEFL）
pnpm.cmd dev        # 启动桌面端（Electron 窗口）
pnpm.cmd dev:lan    # 开发用 LAN 预览：额外在 3000 端口提供 Web 界面（默认关闭）
pnpm.cmd smoke      # 冒烟测试：自检内核 / 桥 / 子应用 iframe 后自动退出
```

`dev:lan` 是临时开发工具，不是正式多端方案（见 [D-0071](user-spec/decisions/0071-dev-lan-preview.md)）：手机和电脑连同一热点后，打开终端打印的 `http://<电脑IP>:3000/shell/`。普通 `dev` 不监听端口；用 `MYOUTSIDE_LAN_PORT` 可改端口。没有鉴权，只用于可信热点。

数据位置（开发期）：Windows `%APPDATA%/MyOutside/myoutside.db`，macOS `~/Library/Application Support/MyOutside/myoutside.db`；`pnpm.cmd simulate` 用的是仓库内 `data/`。

不想开终端时（仅 Windows）：双击桌面的 **MyOutside** 快捷方式（静默启动，无控制台），或运行 `scripts/launch/MyOutside.cmd`（带控制台、便于看日志）；快捷方式可用 `scripts/launch/create-shortcut.ps1` 重建。应用带单实例锁，重复双击会聚焦已有窗口。

当前 v0 已实现：Electron 程序 + 内核（串行队列、事务、硬所有权、迁移、DataVersion、平台设置、平台 AI 代理（思考强度 / 思考过程 / usage 透传））+ 学英语应用（复习（间隔预览 / 完全学会）/ 查词（AI）/ 词库 / 添加（LLM 去重）/ 统计 / 词表分级标注（托福 · 词以类记））+ 对话应用（多会话 / 树形历史与分叉切换 / 思考强度与思考过程 / Markdown 渲染 / 链接外开 / usage 统计显示）+ 围棋应用（9 路特殊规则 / 双人联机 / 聊天 / 悔棋 / 棋谱回放）。
未实现：临时函数、builder、哲野、移动端、打包分发。
