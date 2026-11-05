# agent 设计

> 状态：构想（2026-11-05），作者的想法，尚未开始设计。
> 这里的 **agent** 指像小黄人一样的智能体；工作流叫 workflow（概念见 [concepts/agent.md](../concepts/agent.md)）。

## 要做

- agent 设计这件事肯定要做：MyOutside 更接近一个「富有智能的操作系统状物」，但「好的 agent」也是需要的，不可能没有 agent（见 [vision.md「数字家园」](../vision.md)）。
- LobeHub 和 OpenClaw 都是很不错的 agent 设计（资料见 [LobeHub](../../references/lobehub/LobeHub.md)、[OpenClaw](../../references/openclaw/OpenClaw.md)）。

## 重点：记忆管理

记忆可以按时效长短分级：

- **短时记忆**：上下文；
- **中时记忆**：一个「OpenClaw」有的那种记忆（作者觉得这个名字有点拗口）；
- **长时记忆**：关于一个用户的记忆（参见 [统一能力「记忆数据统一」](unified-capabilities.md)）。

由此得到三类 agent 身份（作者暂且这样称呼）：

- **session**：绑定某个短时记忆；
- **claw**：绑定某个中时记忆。OpenClaw 就是一个 claw；
- **assistant**：绑定某个长时记忆，或者绑定一个用户 / 公司。

## 要更容易地产生 agent

- 现在普通的编码 agent 软件，产生一个 session 的方式几乎只有一句一句把信息给它；fork 很少有人用（或者说大部分普通用户不会去用）。
- fork 是个非常好的功能：可以在任何时候把一个短时记忆存档，产生一个新的 session。不同的 session 可以用来处理不同的手头工作，不需要再把信息说一遍，也不用让 agent 再去把代码或文档读一遍。
- 将来设计 agent 时，要把 fork 做得更好、更方便、更主动。它真的是个很重要的功能：fork 一次，就能产出一个 session 级的 agent。
- 这里的 fork 和 Codex、Claude Code、OpenCode 的 fork 是一个意思。它们在底层上和对话应用里的分叉是一样的：都是在某一条消息处分支出多个版本。可以认为它们共用祖先消息，也可以认为是两个不同的 session——这只是看法或存储方式，不影响这两种 fork 出来的 session 完全一样；即使看成两个无关的 session，它们调用 LLM API 时也会复用公共祖先的缓存。

## 未定

- session、claw、assistant 是作者暂定的叫法。
- 「中时记忆」的名字。
