# D-0057 参考词表数据随仓库提交，`.gitignore` 只忽略根目录 `data/`

- 状态：有效
- 日期：2026-10-23
- 决策者：作者
- 服务于：
  - 作者预期：`user-spec/apps/vocab.md`「作者本人要学托福，这个应用要为此服务」
  - 上游决策：D-0025

## 背景

`apps/vocab/backend/src/data/toefl-word-levels.json` 由 `pnpm build:toefl` 从作者本机的《词以类记》分级结果生成。`.gitignore` 的 `data/` 规则本意是忽略仓库根目录的 `data/`（`pnpm simulate` 的工作目录），但它会匹配任意层级的 `data/`，导致这个文件从未进入仓库。

全新 clone 并 `pnpm install` 后，`apps/vocab` 的类型检查与测试失败（`Cannot find module './data/toefl-word-levels.json'`），桌面端无法加载学英语应用，托福分级徽章（D-0025）在其他环境不可用。

## 决策

1. `.gitignore` 的 `data/` 改为 `/data/`，只忽略仓库根目录；
2. 提交生成好的 `apps/vocab/backend/src/data/toefl-word-levels.json`。其他环境不需要源数据即可使用完整功能。
   - `pnpm build:toefl` 仍是唯一重新生成途径，只有作者本机有源数据。

## 代价

- 仓库多约 70KB 数据；
- 源数据或生成逻辑变化时，需要手动重新生成并提交。

## 什么时候应该重新考虑

- 参考词表大到不适合随仓库分发；
- 或引入正式的数据包 / 资源分发机制时。
