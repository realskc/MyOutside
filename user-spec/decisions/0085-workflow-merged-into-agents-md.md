# D-0085 开发方式并入 AGENTS.md；AGENTS.md 属于 user spec

- 状态：有效
- 日期：2026-11-09
- 决策者：讨论（作者提出把 workflow 整个并进 AGENTS.md，并确认「AGENTS.md 只是位置不在 user spec 目录里，但它就是属于 user spec 的」；结构由 agent 设计）
- 服务于：
  - 作者预期：[user-spec/README.md](../README.md)（user spec 是项目的源头）、[AGENTS.md](../../AGENTS.md)（作者对开发方式的预期）

## 背景

之前作者对开发方式的预期写在 `user-spec/workflow.md`，给 agent 的规则写在根目录 `AGENTS.md`，两边有重合（提交与推送、汇报标记、不写兼容代码、修 bug 记决策），改规则要改两处，已经不同步。更要紧的是：agent 工具开工时只会自动读 `AGENTS.md`，`workflow.md` 要 agent 顺着链接去读才看得到，而「不能破坏真实数据」「不打扰作者」「密钥不泄露」这几条只写在 `workflow.md` 里。

## 决策

- `user-spec/workflow.md` 的内容整个并入根目录 `AGENTS.md`，删除 `workflow.md`；作者的原话原样保留。
- `AGENTS.md` **属于 user spec**，只是放在根目录（agent 工具会自动读到）；`user-spec/README.md` 写明这一点，只看 user spec 重构项目时，范围是 `user-spec/` 加上 `AGENTS.md`。
- 结构：开头一段「红线」（最不能违反的几条），然后「动手之前」「和作者的合作方式」「动手之后：记录决策」「工程规范」「当前阶段的节奏」；每条规则只写一处。
- 细节（决策模板、references 的规则等）留在各自的 README，`AGENTS.md` 只放链接，避免它越写越长。

## 考虑过、没有采用

- **保留 `workflow.md`，`AGENTS.md` 只写「开工先读 workflow.md」和红线**：还是要靠 agent 主动去读。
- **用 OpenCode 的配置让 `workflow.md` 也自动加载**：只对 OpenCode 有效，换别的 agent 工具就读不到了。

## 代价

- user spec 不再全在 `user-spec/` 目录里，要靠 `user-spec/README.md` 和 `AGENTS.md` 开头的说明记住这一点。

## 什么时候应该重新考虑

- `AGENTS.md` 长到重点不突出时（例如超过两三百行），把细则拆回 `user-spec/` 的文档、`AGENTS.md` 只留红线和索引；
- agent 工具普遍支持自动加载多个说明文件时。
