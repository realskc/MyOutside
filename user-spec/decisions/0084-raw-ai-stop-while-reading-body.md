# D-0084 原始 AI 请求在读响应体时被停止，统一报「已取消」（ABORTED）

- 状态：有效
- 日期：2026-11-07
- 决策者：agent（作者同意修）
- 服务于：
  - 作者预期：[对话 user spec「实验对话（实验室）」](../../apps/dialog/user-spec/README.md)（每次运行都保存完整记录，含状态）
  - 上游决策：[D-0082](0082-raw-ai-request-api.md)（`platform.ai.chatRaw`）、[DIALOG-0020](../../apps/dialog/user-spec/decisions/DIALOG-0020-laboratory.md)（取消时存为 aborted）

## 背景

`platform.ai.chatRaw` 先用 `deepseekPost` 发请求，再 `response.text()` 读完整的响应体。`deepseekPost` 已经把「发请求时被取消」统一成 `KernelError("ABORTED")`，读响应体这一步原来没有处理。

## 决策

- 读响应体时出错：如果是被停止打断的（`ctx.signal.aborted`），抛 `KernelError("ABORTED", "调用已取消")`；否则抛 `UPSTREAM`（可重试）。和流式读取（`readSse`）的做法一致。

## 修复的 bug

- **现象**（agent 审查实验室时发现，2026-11-07）：在实验室运行时点「停止」，运行记录常被存成「失败」，错误原因是一句英文 `This operation was aborted`，而不是「已停止」。
- **原因**：DeepSeek 的非流式请求在等待期间会先回响应头、再持续发空行（官方文档「请求保活机制」），所以停止大多发生在读响应体时。这时抛出的是 `fetch` 原生的 `AbortError`（`code` 是数字 20），不是 `KernelError`；`dialog.labRun` 按 `code === "ABORTED"` 判断，于是记成了 error。顶层的 `kernel.handle` 会把「已取消后的任何错误」兜底成 ABORTED，但子应用内部经 `ctx.call` 调用时没有这层兜底。
- **为什么原来的做法会出 bug（重构时不能再用）**：只在发请求那一步处理取消、读响应体时不处理；或者依赖顶层 `handle` 的兜底。平台 API 必须自己把取消统一成 `ABORTED`，因为调用它的子应用拿到的是原始错误。
- **怎么验证修好了**：`apps/dialog/test/dialog.test.ts`「labRun：等待响应时停止（上游正在发保活空行）→ 存为 aborted」：模拟 DeepSeek 先回响应头、一直发空行，中途停止。不修时这条测试失败（存成 error），修了才通过。
