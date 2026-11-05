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

## 数据模型：概念的层级

来源：[术语表源文件](https://github.com/lobehub/lobehub/blob/canary/docs/glossary.mdx)；数据库定义（[agent.ts](https://github.com/lobehub/lobehub/blob/canary/packages/database/src/schemas/agent.ts)、[chatGroup.ts](https://github.com/lobehub/lobehub/blob/canary/packages/database/src/schemas/chatGroup.ts)、[topic.ts](https://github.com/lobehub/lobehub/blob/canary/packages/database/src/schemas/topic.ts)、[message.ts](https://github.com/lobehub/lobehub/blob/canary/packages/database/src/schemas/message.ts)、[project.ts](https://github.com/lobehub/lobehub/blob/canary/packages/database/src/schemas/project.ts)、[device.ts](https://github.com/lobehub/lobehub/blob/canary/packages/database/src/schemas/device.ts)、[session.ts](https://github.com/lobehub/lobehub/blob/canary/packages/database/src/schemas/session.ts)）。

主线（从上到下）：

- **个人 / 工作区（Workspace）**：一切东西属于某个用户，或属于一个团队工作区；工作区有自己的订阅、共享的额度、agent 和知识库。
- **Agent**：可配置的 AI 助手，有自己的系统角色、模型、技能、知识库和记忆；是「聊天和派任务的核心单位」，设计成跨很多段对话反复使用，而不是为一段对话而建。还可以有自己的文档（Agent Documents，默认属于这个 agent，也可以关联到某个话题）。内置的有：Lobe AI（也叫 Inbox，开箱即用的通用助手）、Agent Builder（用一句话帮你创建 agent）等。
  - **组（Group，也叫 Agent Group / Group Chat）**：几个 agent 一起完成任务；可以由编排者（Orchestrator）自动推进，也可以用 @ 点名；有顺序、并行、迭代、辩论等模式；成员在组里有角色（例如 supervisor、participant）。
- **话题（Topic）**：和某个 agent 或组的一段对话。
- **子话题（Thread）**：从话题里某条消息分出去的子对话，可以带上原话题的上下文（「接着聊」），也可以从零开始；子话题还可以再分子话题。
- **消息（Message）**：属于某个话题（以及可能的子话题）；每条消息记着它的上一条（`parent_id`），所以一个话题里的消息可以是一棵树（分叉）。另有「消息组」：同一条用户消息让多个模型并行回答。

横向的东西（不在主线里）：

- **记忆（Memory）**：属于用户，不属于某个 agent。agent 从对话中提取你的偏好、角色、工作习惯、经历，以后调用；白盒，可查看、编辑、删除、添加，只记你批准的。
- **资源库（Resources / Library）**：你所有的文件、文件夹、文稿（Page）和知识库；知识库是切成向量片段、可检索的一组文件，agent 可以引用。
- **项目（Project）**：一个长期的、有目标的工作范围；把可复用的 agent 和知识围绕任务和交付物组织起来，但**不拥有它们，也不扩大它们的权限**。有一个协调的主 agent（默认 Lobe AI）；参与的 agent 可以有项目内的角色（如负责人、研究员、实现者、审查者）；状态从待办到完成，**标记完成必须有人审过**（数据库里有约束）。话题可以属于某个项目。
- **工作目录**：项目可以绑定某台设备上的目录作为执行环境；目录仍归设备所有，解除绑定不会删除本地文件；有读写权限设置。话题可以指定用哪个工作目录。
- **设备（Device）**：每个用户每台物理机器一行（标识由机器 ID 推出，重装也不变）；设备在不在线不存数据库，由「设备网关」的实时连接决定。
- **任务（Task）**：一份后台运行的 agent 工作，有状态（待办 → 进行中 → 审查 → 完成）、说明、负责的 agent、活动记录；可以按计划重复。定时任务每次运行都不带之前的对话上下文。

已经弃用的：

- **session**：早期（LobeChat）包在 agent 外面的一层「壳」——侧边栏里的一项，带标题、头像、置顶、分组，和 agent 一一对应，话题挂在它下面。现在话题直接挂在 agent 上，`sessions` 表只为早期数据和手机端的列表保留，新代码不许再写。它不是「一段对话」。
- 术语表里现在唯一出现「session」的地方是编码 agent（Claude Code、Codex）：中途换工作目录会开始一个新的 session。

## 开放与收费

- 可以自托管（Docker、Vercel 等）。许可证是「LobeHub Community License」：在 Apache 2.0 基础上附加条件——可以不改源码直接商用；基于它开发并分发衍生作品，需要向官方购买商业授权。（[LICENSE](https://github.com/lobehub/lobehub/blob/canary/LICENSE)）
- 云端版按订阅和积分计费；用自己的模型 API Key 需要付费套餐。（[术语表](https://lobehub.com/docs/glossary)）
