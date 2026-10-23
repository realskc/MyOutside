# D-0025 导入《词以类记》托福分级作为参考词表，在卡片上显示分级徽章

- 状态：有效
- 日期：2026-10-13
- 决策者：讨论
- 服务于：
  - 作者预期：[apps/vocab.md「定位」](../apps/vocab.md)（作者要学托福）

## 决策

- 用《词以类记》托福词表的分级结果（DeepSeek 三次运行取中位数，A / B / C / D 四级）生成参考词表 `apps/vocab/backend/src/data/toefl-word-levels.json`（`pnpm build:toefl`）；
- 参考词表随数据库迁移一次性种入 `vocab__word_level` 表，**不创建卡片**；
- 同一个词出现在多个分类或级别时，取最高优先级（A > B > C > D）；
- 卡片的 `term` 命中参考词表时，在复习卡背面与词库列表显示「托福 A/B/C/D」徽章。

## 代价

- 生成词表依赖作者本机上的源文件；生成后的 json 随仓库提交（见 [D-0057](0057-track-word-levels-data.md)，修复 issue #1）。

## 什么时候应该重新考虑

展示方式随时可以调整。

## 相关文档

- `docs/apps/vocab.md` §2；`scripts/build-toefl-levels.ts`
