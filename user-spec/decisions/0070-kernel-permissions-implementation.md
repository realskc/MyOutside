# D-0070 调用者识别、权限检查与清单的实现方式

- 状态：有效
- 日期：2026-10-26
- 决策者：agent
- 服务于：
  - 上游决策：[D-0053](0053-kernel-enforced-call-permissions.md)（调用权限）、[D-0056](0056-app-manifest.md)（清单）、[D-0058](0058-public-and-internal-functions.md)（公开 / 内部）、[D-0063](0063-internal-apis-may-be-async-functions.md)（普通的异步函数）

## 决策

**调用者**
- 前端发起：Electron 主进程根据 IPC 的 `senderFrame.url`（`app://<id>/`）确定子应用；`app://shell/` 为外壳；识别不了的页面直接拒绝；
- 后端发起：调用者是正在执行的函数所属的子应用；
- 直接调用内核（不经 IPC，例如脚本、测试、Electron 主进程自身）视为平台内部，受信任。

**权限规则**（内核 `checkAccess`，拒绝时错误码 `FORBIDDEN`）
- 调用自己的函数：不受限（含内部 API、异步函数）；
- 外壳：可以调用平台 API，不调用子应用的 API；
- 平台 API：子应用需在清单 `uses` 里声明；少数只给外壳（`platform.settings.set`）；
- 其他子应用的 API：必须是公开 API，且在清单 `uses` 里声明；
- 函数默认是内部 API，公开需显式声明（`{ visibility: "public" }`）。学英语除 `previewReview`（复习页专用）外都标为公开；对话目前都是内部。

**平台设置**：`platform.settings.get` 对凭据类设置（目前是 `ai.deepseek.apiKey`）返回 `{ value: null, isSet }`，任何调用者都读不到值；平台 AI 在内核里直接读取存储。

**只读句柄**：只读 API 与普通的异步函数拿到的 `ctx.db` 的写入方法会抛出 `FORBIDDEN`。

**普通的异步函数**：函数类别 `async`（`defineAsync`），只能是内部 API；`ctx.call` 可以调用只读 API、本子应用的事务 API（各自进写队列、独立成事务）与本子应用的异步函数。

**清单**：每个子应用一份 `manifest.json`，由 Electron 主进程以静态 `import` 读入后传给 `kernel.registerApp(app, manifest)`；内核校验 id 与协议版本（当前为 1）。**自动发现与装载子应用暂不实现**——仍在 Electron 主进程代码里逐个注册。

**运行 ID、推送与取消**：前端调用时可以带运行 ID；执行中的事件经 `frame.send("kernel:event")` 推回发起调用的页面；`kernel:cancel` 只能取消同一页面发起的调用，内核把取消信号沿嵌套调用向下传递；取消只是通知函数「该停了」，函数可以就此以 `ABORTED` 结束，也可以先经本应用的事务 API 保存已有的进度（内核不因取消而拒绝写入，见 [DIALOG-0017](../../apps/dialog/user-spec/decisions/DIALOG-0017-keep-partial-reply-on-stop.md)）。

## 理由

- 用 `senderFrame` 识别调用者不需要子应用配合，前端无法伪造；
- 默认内部比默认公开更安全：公开是要保持稳定的契约，应当显式决定；
- 清单静态读入最简单；自动发现牵涉构建与动态加载后端模块，等真正需要（例如 builder 新建子应用）时再做。

## 什么时候应该重新考虑

- 做 builder 或安装别人写的子应用时（自动发现、清单修改的批准流程）；
- 其余细节随时可以。

## 相关文档

- `docs/architecture.md` §2.1、§3、§10
