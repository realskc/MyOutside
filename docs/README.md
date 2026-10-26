# 技术文档

`docs/` 是**全局技术文档层**：描述当前实现与已定的技术设计，是派生物，可以随时重写；各子应用的技术文档在 `apps/<app>/docs/`。

- 作者的预期（为什么做、要达到什么）见 `user-spec/`；子应用的见 `apps/<app>/user-spec/`；
- 设计依据：全局见 `user-spec/decisions/`（`D-NNNN`），应用专属见 `apps/<app>/user-spec/decisions/`（如 `GO-0001`）。

| 文档 | 内容 |
|---|---|
| `architecture.md` | 架构与协议：内核、函数与调用、事务、数据访问、平台 API、Electron 程序 |
| `agent.md` | agent 框架（共享库）：分层、平台工具、循环库、工具与权限、执行模式 |
| [`../apps/vocab/docs/README.md`](../apps/vocab/docs/README.md) | 学英语：数据模型、API、添加 / 查词流程、界面 |
| [`../apps/dialog/docs/README.md`](../apps/dialog/docs/README.md) | 对话：消息树、API、生成流程、界面 |
| [`../apps/go/docs/README.md`](../apps/go/docs/README.md) | 围棋：9 路特殊规则、双人联机、聊天、悔棋、棋谱、界面 |
| [`../apps/zheye/docs/README.md`](../apps/zheye/docs/README.md) | 哲野（未实现）：数据模型、状态机、API、流程 |
| `future/one-off-functions.md` | 临时函数（未实现） |
| `future/multi-device.md` | 多端（未实施） |
