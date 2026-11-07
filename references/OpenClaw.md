# OpenClaw

- 官网文档：https://docs.openclaw.ai ；代码：https://github.com/openclaw/openclaw
- 资料最近核对：2026-11-05
- 微信的 ClawBot 插件就是给它做的接入（见 [WeChat ClawBot](WeChat-ClawBot.md)）。

## 一个 agent 是什么

- 官方定义：一个 agent 是「一个人格的完整范围」，包括工作区文件、凭据、模型列表和会话存储。一个网关进程里可以跑多个彼此隔离的 agent，聊天软件里进来的消息按绑定规则分给对应的 agent。默认只有一个 agent，叫 `main`。（[Multi-agent routing](https://docs.openclaw.ai/concepts/multi-agent)）
- 每个 agent 各有：
  - **工作区**：一个文件夹，也是它运行工具时唯一的工作目录；里面放它的说明文件、笔记、技能；
  - **状态目录**：凭据（模型的 OAuth 和 API Key）、模型列表、这个 agent 自己的配置；
  - **会话存储**：聊天记录和路由状态，存在这个 agent 自己的 SQLite 里。
- 工作区里的说明文件（[Agent runtime](https://docs.openclaw.ai/concepts/agent.md)）：`AGENTS.md`（工作规矩）、`SOUL.md`（人格、边界、语气）、`IDENTITY.md`（名字、气质、emoji）、`USER.md`（关于用户）、`BOOTSTRAP.md`（第一次运行的仪式，完成后删除）、`MEMORY.md`（长期记忆）。每个新会话的第一轮，这些文件的内容被注入系统提示词。
- 官方建议把工作区放进私有 git 仓库备份，把它当作私密的记忆；凭据和会话不放在工作区里。（[Agent workspace](https://docs.openclaw.ai/zh-CN/concepts/agent-workspace)）

## 记忆

（[Memory overview](https://docs.openclaw.ai/concepts/memory.md)；[Memory architecture](https://docs.openclaw.ai/concepts/memory-architecture)）

- 「模型只记得存到磁盘上的东西，没有隐藏的状态。」记忆都是工作区里的 Markdown 文件：
  - `USER.md`：稳定的偏好、沟通风格、人际关系、正在进行的项目，写成指令的形式；偏好变了就原地替换，不留互相矛盾的条目；
  - `MEMORY.md`：精选的长期记忆，持久的事实与决定；只在和主人的私聊会话里加载，不在群聊等共享场合加载；
  - `memory/YYYY-MM-DD.md`：每天的工作笔记，不是每次都注入，而是建索引供检索（向量 + 关键词），按时间衰减（30 天减半）；新开会话时自动带上今天和昨天的；
  - `DREAMS.md`：「做梦」的总结，给人看的，不作为记忆来源。
- 怎么写进去：
  - **主动**：agent 工作中随手记到当天的笔记里；你说「记住……」，它就写到合适的文件；
  - **自动**：上下文快满、要压缩之前，先悄悄跑一轮，提醒 agent 把重要的东西存进笔记（用户看不到）；会话结束后，记录也会被收进来；
  - **整理**：每天凌晨 3 点跑一次「做梦」，把笔记里有用的东西提炼、合并、去重后写进 `MEMORY.md` 和 `USER.md`。它是长期记忆唯一的主要写入者；不可信的内容和系统内容不会被提进去。
- 还有「前瞻」的记忆：常驻的意图和定时任务，到了触发条件才出现。
- 默认用 OpenAI 的 embedding，所以记忆片段在建索引和检索时会发给 OpenAI。
