# D-0072 应用自包含：apps/<app>/ 内按层放 spec/docs/decisions，编号 <APP>-NNNN

- 状态：有效
- 日期：2026-10-26
- 决策者：作者
- 服务于：
  - 作者预期：每个应用的代码、user spec、技术文档、决策都属于该应用；应用内部仍按层组织，不把层混在一起。未来其它应用也会逐步迁出全局目录。

## 背景

围棋应用原有 4 条决策放在全局决策目录里，导致全局索引被单个应用占满，也不利于将来把应用拆出去或复用。作者进一步明确：应用自包含不等于把 spec/docs/代码搅在一起；`apps/<app>/` 内部仍应有 `user-spec/`、`docs/` 等分层目录。

## 决策

- 应用专属内容放在应用目录内，并保留层目录：
  - `apps/<app>/user-spec/`：作者预期；
  - `apps/<app>/user-spec/decisions/`：应用决策，编号 `<APP>-NNNN`（如 `GO-0001`）；
  - `apps/<app>/docs/`：技术文档；
  - `apps/<app>/` 其余：代码、测试、构建配置。
- 全局 `user-spec/`、`docs/`、`user-spec/decisions/` 只保留**跨应用/平台级**内容。
- 应用决策可以引用全局决策；链接用相对路径。
- 全局决策索引不再逐条列应用决策，只链接到各应用的 `user-spec/` / `decisions/` / `docs/` 入口。
- 迁移策略：不一次性搬所有应用；目前只迁移 Go，其它应用（vocab/dialog/zheye）继续留在原位置，等改到时再迁。
- 已迁移 Go：
  - 原规则决策 → [GO-0001](../../apps/go/user-spec/decisions/GO-0001-9x9-go-capture-loses.md)
  - 原联机/聊天决策 → GO-0002
  - 原悔棋决策 → GO-0003
  - 原棋谱决策 → GO-0004
  - 技术文档 `docs/apps/go.md` → `apps/go/docs/README.md`
  - 新增 `apps/go/user-spec/README.md`
  - 迁移前的全局编号已释放，可按全局序列继续复用。

## 考虑过、没有采用

- **继续放全局 `user-spec/decisions/`，只用标题区分应用**：全局索引会越来越长，应用边界不清楚；没有采用。
- **应用决策直接放 `apps/<app>/decisions/`，spec 留在全局**（本决策初版）：应用仍是半自包含，层结构不完整；改为 `apps/<app>/user-spec/decisions/`。
- **`user-spec/apps/<app>/decisions/`**：应用拆出/复用时 spec/docs/decisions 不随代码走；没有采用。
- **把所有东西平铺在 `apps/<app>/`**：会模糊 user spec / docs / code 的层边界；没有采用。
- **每个应用单独一个 git 仓库/子模块**：现在还没到那一步；先用目录隔离。

## 代价

- 迁移期间结构不统一：Go 已自包含，vocab/dialog/zheye 仍按层分散；需要逐个迁。
- 应用内容分散在 `user-spec/`、`docs/`、`apps/` 两个体系，查找时要知道应用是否已迁移。
- 应用决策的引用路径比全局单一目录更依赖相对位置；移动应用目录时要一起检查链接。
- 应用编号（GO-、VOCAB- 等）需要各自维护，跨应用引用要写清楚前缀。

## 什么时候应该重新考虑

- 应用被拆成独立仓库、需要独立发布时。
- 需要跨应用统一检索/审计全部决策时（可以加生成索引，而不必搬回全局）。
- 迁移全部完成、旧目录可以移除时；届时更新本决策和索引。
- 应用决策开始包含平台级影响时，应把平台部分提升为全局 D 决策。
