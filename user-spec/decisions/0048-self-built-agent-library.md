# D-0048 agent 框架自研，不引入开源 agent 框架

- 状态：有效
- 日期：2026-10-21
- 决策者：讨论
- 服务于：
  - 用户预期：[platform.md「平台 AI」](../platform.md)（agent 框架必须共享；硬约束在 agent 框架层面实现）
  - 用户预期：[principles.md「约束：软约束与硬约束都要」](../principles.md)

## 决策

自己实现共享的 agent 库（循环、工具、出错处理、进度事件等），不引入 Mastra、LangGraph.js、OpenAI Agents SDK、Vercel AI SDK 等开源框架；从它们借鉴设计。

## 理由

用户的说法：没有什么很值得复用的东西，对着它们借鉴就行了。具体来说：

- 这些框架最有价值的部分——存储 / 记忆、持久化工作流、多模型适配——与内核重叠甚至冲突（D-0004、D-0005：宿主是唯一写入者、数据按应用划分）；
- 需要完全掌控 DeepSeek 的特性（回传 `reasoning_content`、思考开关、自研搜索），通用抽象层容易丢字段；
- 硬约束（谁能调用哪些函数）必须与内核结合，框架不了解我们的内核；
- agent 循环本身只有几百行。

## 考虑过、没有采用

| 框架 | 没有采用的原因 |
|---|---|
| Mastra | 全家桶，自带存储 / 记忆 / 工作流持久化，与内核冲突 |
| LangGraph.js | 概念重，断点存在自己的存储里 |
| OpenAI Agents SDK（TS） | 默认绑定 OpenAI Responses API |
| Vercel AI SDK | 价值主要在模型适配层，而我们的模型层必须走 `platform.ai.chat` |
| DeepSeek Harness | 是编码 agent 产品（Python SDK），不是库；做 builder 时可作参考 |

## 可以借鉴的设计

- AI SDK：停止条件 + 每一步的结构化记录；
- OpenAI Agents SDK：护栏、调用链追踪；
- LangGraph：断点续跑；
- Mastra：区分 agent（模型决定路径）与工作流（固定流程）。

## 什么时候应该重新考虑

- 某个框架出现了我们自己做代价很高、又确实需要的能力。
