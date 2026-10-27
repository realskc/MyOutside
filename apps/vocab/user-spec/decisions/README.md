# 学英语决策（VOCAB）

这里记录**学英语应用专属**的决策；全局/跨应用的决策仍在 [`user-spec/decisions/`](../../../../user-spec/decisions/)。应用 spec 见 [`../README.md`](../README.md)，技术文档见 [`../../docs/README.md`](../../docs/README.md)。

## 约定

- 一条决策一个文件：`VOCAB-NNNN-简短英文标识.md`，编号四位、递增、永不复用。
- 引用写法：`VOCAB-0001`；同一目录内用相对链接。引用全局决策时写 `D-NNNN` 并链接到 [`user-spec/decisions/`](../../../../user-spec/decisions/)。
- 状态：`有效` / `已取代（→ VOCAB-xxxx）` / `已废弃`。决策文件不删除。
- 决策者：`作者` / `讨论` / `agent`。
- 模板、代价、重新考虑条件沿用 [`user-spec/decisions/README.md`](../../../../user-spec/decisions/README.md)。

## 索引

| 编号 | 标题 | 状态 |
|---|---|---|
| [VOCAB-0001](VOCAB-0001-card-is-term-plus-sense.md) | 卡片数据模型：一张卡片 = 单词 + 本质意项 | 有效 |
| [VOCAB-0002](VOCAB-0002-dedup-on-add.md) | 添加卡片时的查重：机械检查拼写 + AI 判断是否同义，不自动合并 | 有效 |
| [VOCAB-0003](VOCAB-0003-mastery-is-manual.md) | 「已掌握」完全由用户手动标记 | 有效 |
| [VOCAB-0004](VOCAB-0004-card-content-in-chinese.md) | AI 生成的卡片内容一律用中文，例句保持英文 | 有效 |
| [VOCAB-0005](VOCAB-0005-toefl-word-levels.md) | 导入《词以类记》托福分级作为参考词表 | 有效 |
| [VOCAB-0006](VOCAB-0006-fsrs-scheduling.md) | 复习调度使用 FSRS（ts-fsrs） | 有效 |
| [VOCAB-0007](VOCAB-0007-ai-lookup.md) | 查词：AI 翻译解说并生成卡片草稿 | 有效 |
| [VOCAB-0008](VOCAB-0008-review-screen.md) | 复习界面：三个评分按钮 +「完全学会」 | 有效 |
| [VOCAB-0009](VOCAB-0009-track-word-levels-data.md) | 参考词表数据随仓库提交；`.gitignore` 只忽略根目录 `data/` | 有效 |
| [VOCAB-0010](VOCAB-0010-dedup-low-effort-and-commit-check.md) | 查重用低强度思考；添加卡片时做提交时校验 | 有效 |
