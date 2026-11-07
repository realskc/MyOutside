# D-0082 实验用的原始 AI 请求 API（platform.ai.chatRaw）：原样透传请求体与响应

- 状态：有效
- 日期：2026-11-07
- 决策者：讨论（作者要「修改请求体中的一切」；实现细节由 agent 设计）
- 服务于：
  - 作者预期：[对话 user spec「实验对话（实验室）」](../../apps/dialog/user-spec/README.md)
  - 上游决策：[D-0014](0014-deepseek-as-ai-provider.md)（平台 AI 使用 DeepSeek）、[D-0053](0053-kernel-enforced-call-permissions.md)（清单声明调用）、[D-0074](0074-usage-and-cost-display.md)（用量与花费）

## 背景

对话的实验室（DIALOG-0020）要让作者直接编辑发给模型的完整请求体，包括 `max_tokens`、`top_p`、`stop`、`response_format`、`n`、`logprobs`、`tool_choice` 等字段，并看到未整理的原始响应与上游错误。

现有的 `platform.ai.chat` 只暴露 `messages / tools / model / temperature / reasoningEffort / toolChoice / stream`，zod 会过滤其他字段；响应也会被整理成 `content / reasoning / toolCalls / usage`。这达不到「请求体中的一切」。

## 决策

新增平台只读 API `platform.ai.chatRaw`：

- 输入 `{ body }`，把 `body` 原样 POST 到 DeepSeek 的 `/chat/completions`，不增删字段；
- 输出 `{ body, usage, costYuan }`：`body` 是上游原始 JSON，`usage` 是整理后的用量，`costYuan` 是按 D-0074 估算的花费；
- 出错时 `KernelError.details.body` 是完整的上游错误体（普通 API 的 message 仍只放前 300 字）；
- key 与 base URL 仍由平台保管；子应用拿不到，也不能改；
- 记录 usage，计入用量与花费；
- 第一版不支持流式：`stream: true` 直接以 `PRECONDITION` 拒绝；
- 这是 public API，子应用在清单 `uses` 里声明后才能调用。

普通 `platform.ai.chat` 保持不变，正常子应用继续用它。实验室这类明确要实验的工具才用 raw API。

## 考虑过、没有采用

- 给 `platform.ai.chat` 加 `extraBody` / `rawResponse` 开关：会把实验能力和正常 API 混在一起，正常路径的 schema 约束也会变得含糊。
- 让实验室直接拿着 key 调 DeepSeek：违反「密钥由平台保管、子应用拿不到」。
- 只开放一份字段白名单：仍然不是「一切」；作者做实验时需要让 DeepSeek 自己报错，而不是由平台提前拒绝。

## 代价

- 绕过了正常 AI API 的消息结构校验，也可能违反正常路径的约束（例如 D-0059 的 `tool_choice` 限制、D-0078 的工具定义不变）；这些只适合实验，不能当成普通应用的做法。
- 目前是 public API。现阶段只有作者写应用，问题不大；将来分发时需要评估是否收紧成只给实验室的特殊权限。
- 第一版非流式；长回复要等完整响应。

## 什么时候应该重新考虑

- 实验室需要流式输出时；
- 需要按子应用限制 raw API 时；
- DeepSeek 的接口或计费字段发生较大变化时。
