# D-0012 内核、契约与子应用后台保持运行时无关

- 状态：有效
- 日期：2026-10-01
- 决策者：讨论
- 服务于：
  - 用户预期：[platform.md「多端」](../platform.md)
  - 上游决策：[D-0013](0013-cloud-kernel-for-multi-device.md)

## 决策

- 内核、契约、子应用后台代码不 import Electron 或浏览器专有 API；
- 存储与传输经适配层：`kernel-node`（Node 环境的 SQLite + fs）在本地与将来的云端复用；
- 调用面（`outside.call`）不假设与内核同进程，传输可以从 Electron IPC 换成 WebSocket；
- 设备能力（发音、通知、文件选择）只放在界面侧，不进后台服务。

## 代价

多一层适配接口。

## 什么时候应该重新考虑

- 确定永远不做多端。

## 相关文档

- `docs/future/multi-device.md` §2
