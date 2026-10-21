# 平台

## 技术选型的总体预期

- 开发以 AI Agent 为主，技术选型与架构**优先考虑 Agent 的可迭代性**（见 [D-0003](decisions/0003-single-language-typescript.md)）。
- MyOutside 是在 Windows、macOS、Linux 上表现一致的桌面应用（平台要求见 `product.md`；宿主实现见 [D-0002](decisions/0002-electron-host.md)）。

## 子应用的形态

- 每个子应用由两部分组成：
  - **后台服务**：拥有自己的数据，对外提供功能；**没有界面也能被调用**（例如被其他子应用调用）；
  - **前台界面**：只通过**自己的后台**访问数据。
- 子应用**安装即常驻**，没有启用 / 停用的概念（这是预期，但理由还没完全想清楚，见「未定」）。

## 数据归属与子应用之间的连接

子应用之间要能耦合（见 `principles.md`「耦合哲学」），而且**耦合的子应用要容易连接、也容易剥离**。为此有两条非常重要的预期：

1. **每一份数据都必须有一个唯一确定的所有者**（某个子应用，或平台本身）。
2. **子应用之间不得用任意方式混乱地相互调用**：跨应用的读写与调用，都要经过明确的通道。

数据以什么形式存储（例如是不是「表」）、通道具体长什么样，都是实现方案（当前见 [D-0005](decisions/0005-data-ownership-by-table-prefix.md)、[D-0006](decisions/0006-cross-app-calls-via-owner-api.md)）。

## 数据一致性

- 跨应用的一次操作（例：对话里加一个词，同时在学英语应用里落账）**要么全部生效，要么全部不生效**，不能留下半截状态。
- 结构上**不会出现写冲突**，不依赖开发者自觉。

实现见 [D-0004](decisions/0004-sqlite-single-writer-queue.md)、[D-0007](decisions/0007-sync-pure-tx-functions.md)、[D-0008](decisions/0008-resolve-then-commit.md)。

## 开发时的更新

- 开发中更新某个子应用，**不能靠整机重启**——整机重启会连带重启所有子应用、丢失正在进行的会话（实现见 [D-0017](decisions/0017-per-app-hot-reload.md)，尚未实现）。

## 平台 AI

- AI 是平台提供给各个子应用的**核心能力**，预计多个子应用都会使用。
- **AI 服务的密钥由平台保管，子应用拿不到。**
- **agent 框架必须是共享的**：对话、哲野以及将来的子应用都会用到 agent，而且很可能是更复杂的 agent（提供搜索、编辑等能力）。agent 框架要做成共享的能力，**不能每个子应用各写一套**。对 builder 行为边界的硬约束也要在 agent 框架层面实现（见 `principles.md`「约束：软约束与硬约束都要」）。
- **用量管控**：子应用增多、分发给其他人（朋友或用户）以后，一定要有**按子应用的、更严格的 token 用量管控与显示**。现阶段开销不高，暂不实现。
- 当前使用 DeepSeek（见 [D-0014](decisions/0014-deepseek-as-ai-provider.md)）。

## 多端

- 将来要在手机上使用 MyOutside，**个人数据在电脑与手机之间共用**（见 `product.md`「平台」）。云同步是将来才实现的事。
- 当前为此做的准备与选定的方向见 [D-0012](decisions/0012-runtime-agnostic-kernel.md)、[D-0013](decisions/0013-cloud-kernel-for-multi-device.md)、[D-0020](decisions/0020-mobile-via-web-ui.md)。

## 外壳

- 窗口与面板形态、界面语言、启动方式都是实现层面的选择，见 [D-0010](decisions/0010-single-window-single-active-panel.md)、[D-0015](decisions/0015-bilingual-ui.md)、[D-0016](decisions/0016-single-instance-and-launcher.md)、[D-0018](decisions/0018-iframe-panel-and-app-protocol.md)。

## 未定

- **安装即常驻**：是预期，但还没有一个清晰明确的理由。
- **数据的底线要求**（能否导出带走、存在哪里等）：暂不考虑——现在的数据体系是临时版本，还没有用户体系，也没有跨设备的云端同步。
- **数据恢复**（误删、或 builder / 临时函数改坏数据后能否恢复）：暂不考虑，但**很重要，以后要思考**。可能与 `principles.md`「硬约束是保底」相关。
- **主页像移动端桌面**：MyOutside 的主页类似手机桌面，每个子应用一个圆角矩形图标，点击打开子应用。只是一个 UI 层面的想法，尚不完善（早期文档中称为「模拟器式界面」，目前未实现）。
