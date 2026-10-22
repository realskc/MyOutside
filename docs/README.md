# 技术文档

`docs/` 是**技术文档层**：描述当前实现与已定的技术设计，是派生物，可以随时重写。

- 用户的预期（为什么做、要达到什么）见 `user-spec/`；
- 设计依据见 `user-spec/decisions/`，文中以 `D-NNNN` 引用。

| 文档 | 内容 |
|---|---|
| `architecture.md` | 架构与协议：内核、函数与调用、事务、数据访问、平台 API、宿主 |
| `agent.md` | agent 框架（共享库）：分层、平台工具、循环库、工具与权限、执行模式 |
| `apps/vocab.md` | 学英语：数据模型、API、添加 / 查词流程、界面 |
| `apps/dialog.md` | 对话：消息树、API、生成流程、界面、规划中的搜索与抓词 |
| `apps/zheye.md` | 哲野（未实现）：数据模型、状态机、API、流程 |
| `future/one-off-functions.md` | 临时函数（未实现） |
| `future/multi-device.md` | 多端（未实施） |
