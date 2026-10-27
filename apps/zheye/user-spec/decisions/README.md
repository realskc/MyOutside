# 哲野决策（ZHEYE）

这里记录**哲野应用专属**的决策；全局/跨应用的决策仍在 [`user-spec/decisions/`](../../../../user-spec/decisions/)。应用 spec 见 [`../README.md`](../README.md)，技术文档见 [`../../docs/README.md`](../../docs/README.md)。

## 约定

- 一条决策一个文件：`ZHEYE-NNNN-简短英文标识.md`，编号四位、递增、永不复用。
- 引用写法：`ZHEYE-0001`；同一目录内用相对链接。引用全局决策时写 `D-NNNN` 并链接到 [`user-spec/decisions/`](../../../../user-spec/decisions/)。
- 状态：`有效` / `已取代（→ ZHEYE-xxxx）` / `已废弃`。决策文件不删除。
- 决策者：`作者` / `讨论` / `agent`。
- 模板、代价、重新考虑条件沿用 [`user-spec/decisions/README.md`](../../../../user-spec/decisions/README.md)。

## 索引

| 编号 | 标题 | 状态 |
|---|---|---|
| [ZHEYE-0001](ZHEYE-0001-zheye-explanation-units.md) | 哲野的讲解单元：词 / 句 / 文三种，三种来源 | 有效（未实现） |
| [ZHEYE-0002](ZHEYE-0002-zheye-prerequisites.md) | 哲野的前置检查：轻 / 重前置，只问重前置，全递归 | 有效（未实现） |
| [ZHEYE-0003](ZHEYE-0003-zheye-generation.md) | 哲野的生成：自动开始，全局串行，按依赖顺序，生成后固定 | 有效（未实现） |
| [ZHEYE-0004](ZHEYE-0004-zheye-article-templates.md) | 哲野的三类文章模板 | 有效（未实现） |
| [ZHEYE-0005](ZHEYE-0005-zheye-rubric.md) | 哲野的质量标准（rubric） | 有效（未实现） |
| [ZHEYE-0006](ZHEYE-0006-zheye-no-profiling.md) | 哲野不做口味档案、不做应用内反馈；不要求高保真 | 有效 |
| [ZHEYE-0007](ZHEYE-0007-zheye-recipes-in-repo.md) | 哲野的配方以人可读文件随仓库版本化 | 有效（未实现） |
| [ZHEYE-0008](ZHEYE-0008-zheye-v1-scope.md) | 哲野 v1 的范围 | 有效（未实现） |
| [ZHEYE-0009](ZHEYE-0009-resume-on-startup.md) | MyOutside 启动时自动接着生成，不必打开哲野 | 有效（未实现） |
| [ZHEYE-0010](ZHEYE-0010-flash-max.md) | 哲野用 deepseek-flash，思考强度最高 | 有效（未实现） |
