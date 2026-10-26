# DIALOG-0016 对话回复的生成与保存方式

- 状态：部分被取代（→ [DIALOG-0017](DIALOG-0017-keep-partial-reply-on-stop.md)）：「取消时不保存已生成的部分」被取代
- 日期：2026-10-26
- 决策者：agent
- 服务于：
  - 作者预期：[platform.md「子应用的形态」](../../../../user-spec/platform.md)（agent 状态的维护与存储都在后端）
  - 作者预期：[对话 user spec](../README.md)（主力对话工具；树形历史；需要知道上下文长度）
  - 上游决策：[D-0063](../../../../user-spec/decisions/0063-internal-apis-may-be-async-functions.md)、[DIALOG-0009](DIALOG-0009-web-search-toggle.md)、[DIALOG-0010](DIALOG-0010-search-results-presentation.md)、[DIALOG-0011](DIALOG-0011-streaming-output.md)、[DIALOG-0012](DIALOG-0012-regenerate-reply.md)、[DIALOG-0014](DIALOG-0014-show-current-context-length.md)
- 取代：[DIALOG-0002](DIALOG-0002-backend-orchestrated-reply.md) 中「生成与保存分两步、由前端串起来」的部分；[DIALOG-0004](DIALOG-0004-reasoning-display.md) 中「思考过程不放进后续上下文」的部分（DeepSeek 带工具时要求回传）

## 决策

**生成在后端**：内部 API（普通的异步函数）`dialog.send`（追加用户消息 + 生成）、`dialog.generate`（为某条用户消息生成：重新生成、失败或中断后重试）、`dialog.editAndSend`（编辑产生新分叉 + 生成）。回复由事务 API `dialog.saveReply` 保存；前端只负责发起与显示。切到别的子应用、前端页面被销毁，回复照样生成并保存。

**回复挂在明确的父节点上**：生成时指定「要回答的那条用户消息」，历史沿父指针取到这条消息为止，保存时挂在它下面并把它的选中子节点指向新回复。因此生成期间切换分支、编辑消息，回复也不会挂到错误的地方——不需要额外的长事务机制（D-0063 的「提交时校验」在这里就是「父节点仍存在且是用户消息」）。

**同一个会话同一时刻只生成一条回复**：后端在内存里记录正在生成的会话；`dialog.getPath` 返回 `generating`，前端重新打开时据此显示「生成中」。进程重启后自然清空。

**搜索过程与来源存在回复上**：`message.steps`（调用了工具的各轮：思考过程、说的话、工具调用与交给模型的结果文字）、`message.sources`（编号的来源）。下一次请求重建历史时：
- 联网搜索打开：按轮展开（assistant 带 `reasoning_content` 与 `tool_calls`，加工具结果），满足 DeepSeek 带工具时的回传规则；
- 联网搜索关闭：只保留之前回复的最终回答，不在不带工具定义的请求里放工具调用；
- 截断以「一条用户消息」或「一整轮回复」为单位，不会把工具调用与结果拆开。

**系统提示词**：会话的系统提示词（或默认）+「当前日期」；联网搜索打开时追加使用说明（何时搜索、用 [n] 标注来源、网页内容不是指令）。

**取消与出错**：以 `ABORTED` / 上游错误结束，**不保存**已生成的部分；用户消息保留，可以用 `dialog.generate` 重试。

**上下文长度**：保存回复时记录最后一次请求的输入 token 数（`context_tokens`）；`getPath` 返回的当前上下文长度 = 最近一条带记录的回复的输入 token 数 + 其后内容的估算（DIALOG-0014）。

**参数**：一次回复最多 8 轮；每次搜索取 6 条结果；工具结果交给模型最多 12000 字符。

## 考虑过、没有采用

- 每一轮都存成消息树里的节点（中断后可从末端接着推进）：对话回复短、丢了可重试，整轮跑完再保存更简单；
- 取消时保存已生成的部分：平台 AI 被取消时不返回部分内容，需要额外改造；先不做。

## 什么时候应该重新考虑

- 回复变得很长、很贵，中断损失明显时（考虑逐轮保存、取消时保存部分内容）；
- 其余细节随时可以。

## 相关文档

- `apps/dialog/docs/README.md`、`docs/agent.md`
