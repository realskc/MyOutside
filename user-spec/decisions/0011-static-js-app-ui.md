# D-0011 子应用界面：零构建的静态 HTML / JS

- 状态：有效（计划很快改为 TypeScript）
- 日期：2026-10-02
- 决策者：agent
- 服务于：—

## 决策

子应用界面（`apps/*/ui/`）是不经构建的静态 HTML / CSS / JS，由 Electron 通过 `app://` 协议直接加载（见 D-0018）。

## 理由

v0 起步快，改完刷新即生效，不需要构建链。

## 什么时候应该重新考虑

随时可以。已经计划改为 TypeScript（与 D-0003 一致）。

## 相关文档

- `docs/architecture.md` §1
