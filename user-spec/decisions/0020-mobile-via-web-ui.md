# D-0020 移动端用同一套 Web 界面承载，不做原生 App

- 状态：有效（未实施）
- 日期：2026-10-01
- 决策者：讨论
- 服务于：
  - 作者预期：[platform.md「多端」](../platform.md)
  - 上游决策：[D-0013](0013-cloud-kernel-for-multi-device.md)

## 决策

- 手机端 = 同一套 Web 界面（PWA 或 Capacitor 式 WebView 壳）+ SDK，是薄客户端，不需要本地内核；
- 外壳与子应用界面保持响应式，为手机布局留空间。

## 考虑过、没有采用

- 原生 App：开发成本高，与「一套界面」相悖。
- Tauri 移动端：不在考虑范围。
- 手机本地内核（SQLite WASM + OPFS）：只有「本地优先」方案才需要，降级为备件。

## 相关文档

- `docs/future/multi-device.md` §1、§3
