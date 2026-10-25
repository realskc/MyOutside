# D-0008 AI 辅助的写操作：先解析、后提交

- 状态：部分被取代（→ [D-0063](0063-internal-apis-may-be-async-functions.md)）：「两步之间由前端编排」被取代——两步可以由后端的内部 API（普通的异步函数）串起来
- 日期：2026-10-02
- 决策者：agent（作者已不记得当时的讨论）
- 服务于：
  - 上游决策：[D-0007](0007-sync-pure-tx-functions.md)

## 背景

事务 API 必须同步纯数据，而 AI 调用是异步网络操作。

## 决策

需要 AI 参与的写操作拆成两步：

1. **解析**（只读 API，异步，可调用平台 AI，不落库）；
2. **提交**（事务 API，事务）。

两步之间由界面编排。实例：`vocab.resolveCard` → `vocab.addCard`；`dialog.generateReply` → `dialog.appendMessage`。

## 代价

- 编排在界面里：关掉窗口或切换面板时，进行到一半的流程会丢失；
- 不适合多步的 agent 流程，也不适合将来界面在本地、内核在云端的形态。

## 什么时候应该重新考虑

- agent 框架落地时（需要在后端完成多步流程）；
- `docs/apps/vocab.md` §8 提到的「异步写」函数类别被引入时。

## 相关文档

- `docs/architecture.md` §7；`docs/apps/vocab.md` §4
