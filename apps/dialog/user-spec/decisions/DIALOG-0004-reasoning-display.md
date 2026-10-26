# DIALOG-0004 思考强度按会话设置；思考过程折叠显示、落库、不放进后续上下文

- 状态：部分被取代（→ [DIALOG-0016](DIALOG-0016-dialog-generation-implementation.md)）：「不放进后续上下文」被取代——加了搜索后，历史中的思考过程随请求回传
- 日期：2026-10-07
- 决策者：讨论
- 服务于：
  - 作者预期：[对话 user spec「定位」](../README.md)（使用 DeepSeek 的完整能力）

## 决策

- 每个会话一个思考强度档位：关 / 低 / 高 / 最高（DeepSeek `reasoning_effort`），默认「高」，随时可改，对之后的回复生效；
- 助手回复的思考过程（`reasoning_content`）存入数据库，在回复上方折叠显示；
- 思考过程**不放进后续对话的上下文**。

## 什么时候应该重新考虑

- **加搜索（工具调用）时必须修改**：DeepSeek 规定，请求带 `tools` 时，之后所有请求都要把历史中每一轮的 `reasoning_content` 回传，否则返回 400。
- 其余部分随时可以。

## 相关文档

- `apps/dialog/docs/README.md` §4；DeepSeek 思考模式文档 https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
