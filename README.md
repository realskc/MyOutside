# MyOutside

跨平台（Windows / Linux / macOS）GUI 宿主应用：按协议装载多个子应用（模拟器式界面）；每个子应用拥有私有数据和公开 API，跨应用通过宿主相互调用并原子地交换数据。

当前状态：**需求思考阶段**。

建议阅读顺序：

1. `docs/vision.md` — 核心动机与世界观（为什么做 MyOutside）
2. `docs/requirements.md` — 已确认的决策、悬而未决的问题、非目标
3. `docs/protocol-v0.md` — 子应用协议骨架草案（数据读写、跨应用事务、文件仓库、刷新模型）
4. `docs/apps/` — 子应用规格（`vocab.md` = 第一个子应用：学英语应用）
5. `docs/future/` — 未来方向设计（`multi-device.md` = 多端架构：云端内核方案；`one-off-functions.md` = 临时函数）
