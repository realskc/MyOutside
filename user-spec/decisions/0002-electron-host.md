# D-0002 桌面程序使用 Electron

- 状态：有效
- 日期：2026-09-30
- 决策者：讨论
- 服务于：
  - 作者预期：[product.md「平台」](../product.md)（Windows / macOS / Linux）
  - 上游决策：[D-0003](0003-single-language-typescript.md)（全项目单一语言 TypeScript）

## 背景

需要一个跨三平台的 GUI 桌面程序：内核（串行队列、数据库事务、契约校验、服务调用）与子应用后端都要运行在这个程序内，子应用前端统一为 Web。

## 决策

Electron + TypeScript。内核与子应用后端同住 Node 主进程；自带 Chromium 保证子应用前端三平台一致；每个面板可以开独立 DevTools，方便 Agent 调试。

## 考虑过、没有采用

- **Tauri**：体积、内存更好，但内核要用 Rust 写，或另起 Node 进程，做不到全项目单一语言（违背 D-0003）。

## 代价

体积 100MB 以上、内存较高、启动偏慢——当前接受。

## 什么时候应该重新考虑

- 放弃「在桌面程序内跑 TS 服务」；
- 同屏多面板不再需要，而且体积 / 内存成为真实痛点。

（移动端不走 Tauri，见 D-0020。）

## 相关文档

- `docs/architecture.md` §10
