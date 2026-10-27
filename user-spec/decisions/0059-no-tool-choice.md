# D-0059 不使用 `tool_choice` 的强制调用

- 状态：有效
- 日期：2026-10-24
- 决策者：作者
- 服务于：
  - 作者预期：[对话 user spec「定位」](../../apps/dialog/user-spec/README.md)（使用 DeepSeek 的完整能力）
  - 上游决策：[D-0014](0014-deepseek-as-ai-provider.md)

## 决策

共享的 agent 库与各子应用都不使用 `tool_choice` 的 `required` 与「指定工具」来强制模型调用工具；结构化输出、结束形式等需要「让模型按要求调用工具」的地方，另想办法（例如提示词 + 校验与重试）。

## 理由

DeepSeek 在思考模式下不支持 `required` 与指定工具（返回 400）。为了它而关闭思考不值得。

## 什么时候应该重新考虑

- DeepSeek 在思考模式下支持了这些用法。

## 相关文档

- `docs/agent.md` §3
