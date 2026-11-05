# 参考：其他产品与项目

这里记录 MyOutside 以外的东西：竞品、互补品、开源技术项目，以及其他任何值得参考的东西。作者尤其想多看新的 agent 项目：它们的 agent 设计是怎样的、有什么好的地方。

每样东西一个子目录（例如 `obsidian/`），里面分两种文件：

- **资料**：文件名就是它的名字（例如 `Obsidian.md`）；
- **我们的想法**：统一叫 `thoughts.md`。还没有想法时可以没有这个文件。

和它密切相关的东西（例如围绕它的一种用法）可以放进同一个子目录，资料同样以自己的名字命名。

## 资料

- 调研出来的事实：它是什么、怎么做的、怎么收费……
- agent 可以自行调研、补充、更正，也可以自行新建（作者：资料随便记）。
- 只写事实，不写评价；每条注明来源（链接）；文件开头写最近一次核对的日期——外部的东西会变，资料可能过时。

## 我们的想法

- 对它的看法：有什么值得借鉴、有什么新奇的、能不能被我们使用……
- 和 user spec 一样，**只记作者说的，或者作者明确认可的 agent 的说法**。agent 自己想到的不记；拿不准作者是否认可时，先问。
- 作者认可的 agent 说法，注明「agent 提出，作者认可」。
- 「明确认可」指作者说了「说得好」「有道理」这类表示赞同的话；没有表态不算。（agent 提出，作者认可）
- 某个想法变成了对 MyOutside 的具体预期时，写进对应的 spec 文档，并链接回这里。

## 目录

| 目录 | 资料 | 我们的想法 |
|---|---|---|
| `obsidian/` | [Obsidian](obsidian/Obsidian.md)：本地优先的 Markdown 笔记软件；[LLM Wiki](obsidian/LLM%20Wiki.md)：Karpathy 提出的、让 LLM 编译并维护个人知识库的做法，用 Obsidian 浏览 | [有](obsidian/thoughts.md) |
| `bilibili/` | [Bilibili](bilibili/Bilibili.md)：历史记录接口（非官方） | 无 |
| `wechat/` | [WeChat ClawBot](wechat/WeChat%20ClawBot.md)：个人微信号的官方机器人接入（iLink） | 无 |
| `lobehub/` | [LobeHub](lobehub/LobeHub.md)：以 agent 为工作单位的 agent 团队平台（前身 LobeChat） | 无 |
| `openclaw/` | [OpenClaw](openclaw/OpenClaw.md)：开源的个人 agent；一个 agent = 工作区文件 + 凭据 + 会话，记忆是工作区里的 Markdown | 无 |
