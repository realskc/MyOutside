# 学英语（vocab）

> 这是学英语自己的作者预期。技术文档见 [`../docs/README.md`](../docs/README.md)；决策见 [`decisions/`](decisions/README.md)。

## 定位

- **后端**维护「我的英语状态」：已经掌握的单词、正在背的单词（含复习计划）。
- **前端**是一组随需求增长的功能。现在有复习（背单词）和查词；以后可能有口语练习、英语阅读等。
- 作者本人**要学托福**，这个应用要为此服务（实现见 [VOCAB-0005](decisions/VOCAB-0005-toefl-word-levels.md)）。

## 卡片

- **同一个单词的两个本质不同的释义，就是两个不同的单词。** 所以背单词的单位是「单词 + 一个本质意项」，而不是拼写。例：date 当「椰枣」讲和当「日期 / 约会」讲，是两张卡片（数据模型见 [VOCAB-0001](decisions/VOCAB-0001-card-is-term-plus-sense.md)）。
- **卡片内容用中文**（例句保持英文），与界面语言无关——如果学英语的卡片也全是英语，容易头晕（见 [VOCAB-0004](decisions/VOCAB-0004-card-content-in-chinese.md)）。

## 与其他应用的连接

- 对话等应用里遇到的生词，将来能直接进入学英语应用的记忆计划（`product.md`「强耦合的复合能力」的例子）。不急，暂时不做。

## 实现相关的决策

- 添加卡片时的查重：[VOCAB-0002](decisions/VOCAB-0002-dedup-on-add.md)
- 「已掌握」的判定：[VOCAB-0003](decisions/VOCAB-0003-mastery-is-manual.md)
- 复习调度：[VOCAB-0006](decisions/VOCAB-0006-fsrs-scheduling.md)
- 查词：[VOCAB-0007](decisions/VOCAB-0007-ai-lookup.md)
- 复习界面：[VOCAB-0008](decisions/VOCAB-0008-review-screen.md)

## 未定

- **添加时与已有卡片同义怎么办**：暂时没考虑过，一时半会儿也用不到；目前只要求不至于崩溃。
- **自动判定「已掌握」的阈值**：还没想好，先用手动标记试一下（见 VOCAB-0003）。
- 口语练习、英语阅读等后续功能的具体形态。
