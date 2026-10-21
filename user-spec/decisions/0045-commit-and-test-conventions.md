# D-0045 提交信息与测试规范

- 状态：有效
- 日期：2026-10-02
- 决策者：agent（用户没有特别的要求，觉得挺好）
- 服务于：
  - 用户预期：[workflow.md「工程规范」](../workflow.md)

## 决策

- 提交信息使用 Conventional Commits 风格：`feat(vocab): ...`、`fix(host): ...`、`docs: ...`；
- 内核与子应用后台有单元 / 集成测试（vitest），`pnpm test` 全部通过、`pnpm typecheck` 无错误；
- 涉及界面的改动用冒烟测试验证（`pnpm smoke`，见 D-0046）。

## 什么时候应该重新考虑

随时可以。
