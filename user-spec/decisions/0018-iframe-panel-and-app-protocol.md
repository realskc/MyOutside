# D-0018 子应用面板：一个 iframe + app:// 自定义协议

- 状态：有效
- 日期：2026-10-02
- 决策者：agent
- 服务于：
  - 上游决策：[D-0010](0010-single-window-single-active-panel.md)

## 决策

- 外壳页面里放一个 iframe 作为面板，切换子应用时改变它的地址；
- 子应用界面通过 `app://<应用id>/` 自定义协议加载；
- 界面通过 preload 暴露的 `window.outside.call` 经 IPC 调用内核。

## 考虑过、没有采用

- `WebContentsView` 多面板（早期设想）：单活动面板下 iframe 更简单。

## 什么时候应该重新考虑

随时可以。可以预见的触发点：需要同屏多面板，或子应用之间需要更强的进程隔离。

## 相关文档

- `apps/host/src/main/index.ts`、`apps/host/renderer/`
