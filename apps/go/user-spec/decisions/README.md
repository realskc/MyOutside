# 围棋决策（GO）

这里记录**围棋应用专属**的决策；全局/跨应用的决策仍在 [`user-spec/decisions/`](../../../../user-spec/decisions/)。应用 spec 见 [`../README.md`](../README.md)，技术文档见 [`../../docs/README.md`](../../docs/README.md)。

## 约定

- 一条决策一个文件：`GO-NNNN-简短英文标识.md`，编号四位、递增、永不复用。
- 引用写法：`GO-0001`；同一目录内用相对链接。引用全局决策时写 `D-0071` 并链接到 [`user-spec/decisions/`](../../../../user-spec/decisions/)。
- 状态：`有效` / `已取代（→ GO-xxxx）` / `已废弃`。决策文件不删除。
- 决策者：`作者` / `讨论` / `agent`。
- 模板、代价、重新考虑条件沿用 [`user-spec/decisions/README.md`](../../../../user-spec/decisions/README.md)。

## 索引

| 编号 | 标题 | 状态 |
|---|---|---|
| [GO-0001](GO-0001-9x9-go-capture-loses.md) | 9 路围棋：提子即终局，否则只数围空、不判胜负 | 有效 |
| [GO-0002](GO-0002-go-multiplayer-and-chat.md) | 围棋子应用的联机与聊天：一个对局、令牌入座、500ms 轮询 | 有效（悔棋/棋谱见 GO-0003、GO-0004） |
| [GO-0003](GO-0003-go-undo-by-request.md) | 围棋悔棋：请求对方同意，退回自己上一手 | 有效 |
| [GO-0004](GO-0004-go-records-in-sqlite.md) | 围棋棋谱：存 SQLite，应用内列表 + 回放，不导出外部文件 | 有效 |
