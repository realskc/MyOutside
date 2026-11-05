# LLM Wiki（Andrej Karpathy）

- 原文：[gist「LLM Wiki」](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)；最早的推文「LLM Knowledge Bases」（[2026-04-02](https://x.com/karpathy/status/2039805659525644595)）
- 资料最近核对：2026-11-05

## 是什么

- 一种用 LLM 建个人知识库的做法，不是一个产品。gist 本身是一份「想法文件」：设计成直接复制给自己的 LLM agent（例如 Codex、Claude Code、OpenCode），由 agent 和人一起落实细节。
- 和 RAG 的区别：RAG 每次提问都从原始文档里现找片段，没有积累。LLM Wiki 让 LLM **逐步构建并维护一个持久的 wiki**：一堆互相链接的 Markdown 文件，夹在人和原始资料之间。新资料进来时，LLM 读它、提取要点，并融入已有的 wiki：更新相关页面、修订摘要、标出新旧说法的矛盾。知识只「编译」一次，之后保持更新，不必每次提问都重新推导。
- 分工：人几乎不写 wiki，只负责找资料、探索、提好问题；总结、交叉引用、归档这些杂活全由 LLM 做。原话：「Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase.」

## 三层结构

- **原始资料**：文章、论文、图片、数据文件。只读，LLM 不改；这是事实的来源。
- **wiki**：LLM 生成的 Markdown 文件：资料摘要、实体页、概念页、对比、综述。这一层完全归 LLM：人读，LLM 写。
- **schema**：一份说明文件（例如 `CLAUDE.md`、`AGENTS.md`），告诉 LLM wiki 的结构、约定，以及收录资料、回答问题、维护 wiki 时的流程。人和 LLM 一起慢慢改出来。

## 三种操作

- **收录（ingest）**：放进一份新资料，LLM 读完、和人讨论要点、写摘要页、更新索引和相关页面、记一条日志。一份资料可能牵动 10 到 15 个页面。Karpathy 自己偏好一份一份收录、全程参与。
- **提问（query）**：LLM 先查 wiki 再回答，并注明出处。好的回答（对比、分析、新发现的联系）可以作为新页面写回 wiki，探索也就和资料一样积累下来。
- **体检（lint）**：定期让 LLM 检查 wiki：页面之间的矛盾、被新资料推翻的旧说法、没有任何链接指向的孤立页面、提到了却没有自己页面的概念、可以用网页搜索补上的空缺。

## 其他要点

- 两个特殊文件：`index.md`（按类别列出所有页面和一句话摘要，回答问题时先读它；在约 100 份资料、几百个页面的规模下，不需要向量检索）；`log.md`（只追加的时间线，记录每次收录、提问、体检）。
- 规模变大后可以加本地搜索工具（推荐 [qmd](https://github.com/tobi/qmd)）。
- 整个 wiki 就是一个装着 Markdown 的 git 仓库，版本历史天然就有。
- 他给的理由：维护知识库最累的不是阅读和思考，而是记账式的维护；人会放弃 wiki，是因为维护负担涨得比价值快，而 LLM 不会厌倦。思路上和 Vannevar Bush 1945 年设想的 Memex 相近，当年解决不了的是「谁来维护」。
- 适用场景举例：追踪个人目标与健康、长期研究一个主题、边读书边建书的 wiki、团队内部 wiki、竞品分析、旅行计划、课程笔记。

## 反响

- 发布后几天内出现了十几个开源实现（[Proudfrog 的整理，2026-04-08](https://proudfrog.com/en/insights/karpathy-llm-wiki-complete-workflow-guide)）；例如 [llm-wiki-compiler](https://github.com/atomicmemory/llm-wiki-compiler)（约 1600 星）。
