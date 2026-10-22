# D-0050 搜索与抓取做成平台 API

- 状态：有效（未实现）
- 日期：2026-10-21
- 决策者：agent
- 服务于：
  - 用户预期：[platform.md「平台 AI」](../platform.md)（密钥由平台保管；按子应用的用量管控）

## 决策

DeepSeek Search / Fetch 包装成平台 API `platform.web.search` / `platform.web.fetch`，由平台持有密钥、按调用者计量；agent 循环库提供包装好的工具。

## 理由

与 `platform.ai.chat` 同理：密钥不能交给子应用；多个子应用都会用到搜索；按次计费需要统一计量。

## 什么时候应该重新考虑

随时可以。

## 相关文档

- `docs/agent.md` §5
