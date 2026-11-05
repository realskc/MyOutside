# agent 设计

> 状态：构想（2026-11-05），作者的想法，尚未开始设计。
> 这里的 **agent** 指像小黄人一样的智能体（见 [vision.md「智能像灵气」](../vision.md)）。它和 [concepts/agent.md](../concepts/agent.md) 现有的定义（「agent 就是工作流」）不同；概念怎么划分，作者还要重新考虑。在那之前，这篇文档里的用词以这里的说明为准。

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

## 未定

- 概念划分：agent、session、claw、assistant 这几个名字，以及它们和 `concepts/agent.md` 现有概念的关系。
- 「中时记忆」的名字。
