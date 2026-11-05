# LobeHub

- 官网：https://lobehub.com ；代码：https://github.com/lobehub/lobehub
- 资料最近核对：2026-11-05

## 是什么

- 前身是开源的聊天界面 LobeChat（许可证里仍写着 LobeChat），现在叫 LobeHub，自称「Chief Agent Operator」（首席 agent 运营官）：替你组织一支 AI agent 团队，「招聘、排班、汇报」，7×24 小时运转，「你掌控全局，但不必一直在线」。（[GitHub README](https://github.com/lobehub/lobehub)）
- 核心理念是**以 agent 为工作的单位**：README 认为现在的 agent 是一次性的、按任务用完即走的，缺少上下文、彼此孤立；LobeHub 要做「一个工作与生活的空间」，在里面寻找、创建 agent 队友，并和它们协作，agent 会跟着你一起成长，「人与 agent 共同进化」。（同上）
- 每个 agent 是「长期的队友，而不是一次性的对话」，由六部分组成：系统角色、模型、技能、集成（MCP 等）、知识库、记忆。（[文档：Agent](https://lobehub.com/docs/usage/getting-started/agent)）
- GitHub 约 8.4 万星、1.6 万 fork（2026-11-05）。

## 主要能力

- **CAO**（2026-05-19 推出）：agent 自己检查自己的工作、决定下一步、不等你说「继续」；需要你拍板时才停下来，说明试过什么、提一个清楚的问题；大任务会组一个小的子 agent 团队分工，主 agent 负责计划。（[更新日志](https://lobehub.com/changelog/2026-05-19-chief-agent-operator)）
- **创建 agent**：用一句话描述，由 Agent Builder 自动配置；也可以从社区市场一键添加。宣称有 33 万多个技能、11 万多个 MCP 服务可接。（[官网](https://lobehub.com/home)）
- **协作**：Agent Group（系统自动组队、并行协作）；Pages（多个 agent 共享上下文一起写文档）；定时任务；项目；团队共享的工作区。（同上）
- **记忆**：「白盒记忆」——agent 从对话中提取你的偏好、角色、工作习惯、经历，你可以查看、编辑、删除、添加，agent 只记你批准的。（[术语表](https://lobehub.com/docs/glossary)）
- **在聊天软件里用**：Messenger 用官方机器人接 Telegram、Slack、Discord（个人使用）；Channels 用你自己的机器人接 Discord、Slack、Telegram、LINE、iMessage、QQ、微信、飞书等。微信渠道从 2026-07-10 起新建连接需要付费套餐。（[Messenger 文档](https://lobehub.com/docs/usage/messenger/overview)；[更新日志](https://lobehub.com/changelog)）
- **云端运行，按需够到你的电脑**：agent 跑在云端；装了 LobeHub 桌面客户端后，agent 可以按需访问你电脑上的文件、运行工具。（[LobeHub for Telegram](https://lobehub.com/lobehub-for-telegram)）
- 文档目录里还有：任务、GTD、笔记本、沙箱、接入 Claude Code 和 Codex。（[文档](https://lobehub.com/docs/usage/getting-started/agent)）

## 开放与收费

- 可以自托管（Docker、Vercel 等）。许可证是「LobeHub Community License」：在 Apache 2.0 基础上附加条件——可以不改源码直接商用；基于它开发并分发衍生作品，需要向官方购买商业授权。（[LICENSE](https://github.com/lobehub/lobehub/blob/canary/LICENSE)）
- 云端版按订阅和积分计费；用自己的模型 API Key 需要付费套餐。（[术语表](https://lobehub.com/docs/glossary)）
