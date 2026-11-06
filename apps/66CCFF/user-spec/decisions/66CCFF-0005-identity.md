# 66CCFF-0005 应用标识：id `66CCFF`，中文名「纯蓝」，英文名 66CCFF

- 状态：有效
- 日期：2026-11-06（2026-11-04 初版）
- 决策者：作者
- 服务于：作者预期：命名
- 上游决策：[D-0081](../../../../user-spec/decisions/0081-app-table-prefix.md)（物理表名统一 `app_` 前缀）

## 背景

作者指定应用名为 **66CCFF**（不要 `0x` 前缀），中文名「纯蓝」。最初内核要求应用 id 以字母或下划线开头，所以曾使用临时内部 id。现在内核允许应用 id 以数字开头，并把所有应用的物理表名统一加 `app_` 前缀（D-0081），因此应用 id 可以直接使用 `66CCFF`。

URL host 和 npm 包名按各自规范使用小写形式 `66ccff`；显示名、app id、API 名和数据目录保持 `66CCFF`。

## 决策

- 应用 id：`66CCFF`；
- 物理表前缀：`app_66CCFF__`；
- 显示名：`66CCFF`；中文名「纯蓝」作为界面里的副名；
- URL / media host：`app://66ccff/...`、`media://66ccff/...`（host 大小写不敏感）；
- npm workspace 包名：`@myoutside/66ccff`；
- 源码目录：`apps/66CCFF`；应用数据目录：`<userData>/apps/66CCFF`。

## 代价

- URL 和 npm 包名无法保留大写，使用 `66ccff`；
- 应用数据目录、数据库表名和旧 id 需要一次性迁移。
