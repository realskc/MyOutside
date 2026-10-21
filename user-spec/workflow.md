# 开发方式

## user spec 与决策

- 本项目按 user spec 的方式开发：用户的预期写在 `user-spec/`，实现上的选择记为决策（见 `README.md`）。
- 编码 agent 动手前先读 user spec，动手后记录决策（见仓库根目录 `AGENTS.md`）。

## 当前阶段的节奏

- **现阶段先推进实用的功能和 demo。**
- 文档与代码之间的细节不一致，暂时不管。

## 不能破坏作者的生活数据

- 开发、测试过程**不能破坏作者的真实数据**——这些数据是作者生活的一部分。
- 用什么方式保证（例如临时数据副本、假数据）不做要求（当前做法见 [D-0046](decisions/0046-smoke-on-temp-data-copy.md)）。

## 语言

- 文档用中文写。

## 工程规范

- 没有特别的要求。当前的规范见 [D-0044](decisions/0044-docs-sync-with-features.md)、[D-0045](decisions/0045-commit-and-test-conventions.md)。

## 冲突处理

- 需求层次上的冲突（例如服务个人生活与产品化之间），把冲突的原因告诉用户，由用户决定（见 `product.md`「双重使命」）。
