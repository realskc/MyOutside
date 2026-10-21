# D-0014 平台 AI 使用 DeepSeek

- 状态：有效
- 日期：2026-10-01
- 决策者：用户
- 服务于：
  - 用户预期：[platform.md「平台 AI」](../platform.md)

## 决策

- 平台 AI 服务使用 DeepSeek；默认模型 `deepseek-flash`（平台设置可覆盖）；
- 由平台代理调用（`platform.ai.chat`）：透传 messages / tools / 思考强度，返回内容、工具调用、思考过程与 token 用量。

## 理由

DeepSeek 的 API 又强又便宜，现在还提供了搜索服务（Search / Fetch）。用户的说法：这一条「几乎是预期」，暂时完全没有考虑其他方案。

## 什么时候应该重新考虑

- DeepSeek 在能力、价格或可用性上失去优势。由平台代理调用，换模型或多模型并存时子应用无需改动。

## 相关文档

- `docs/architecture.md` §6.1；`packages/kernel/src/platform-ai.ts`
