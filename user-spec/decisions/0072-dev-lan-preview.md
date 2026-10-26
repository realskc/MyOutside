# D-0072 开发用 LAN 预览：Electron 主进程内加一个可选 HTTP 宿主

- 状态：有效
- 日期：2026-10-25
- 决策者：agent
- 服务于：
  - 作者临时需求：在飞机上通过手机热点，用其他设备打开 MyOutside（用于玩在 MyOutside 里写的游戏）。这不是产品 spec 的一部分。
  - 上游决策：[D-0012](0012-runtime-agnostic-kernel.md)（调用面可换传输）、[D-0013](0013-cloud-kernel-for-multi-device.md)（正式多端方向是云端内核）

## 背景

MyOutside 的界面由 Electron 宿主通过 `app://` 协议加载，界面里的 `window.outside.call` 由 preload 经 IPC 调用主进程的内核。浏览器没有 `app://`，也没有 preload，所以直接起一个静态服务器只能拿到 HTML，界面无法调用数据。

作者需要在没有公网、只有手机热点的飞机上，让同一热点下的手机/电脑打开 MyOutside，并玩之后在 MyOutside 里新增的游戏。这个需求是临时的、开发自用的，不改产品形态。

## 决策

- 增加一个 opt-in 的 LAN 预览模式：`pnpm dev:lan`；普通 `pnpm dev` 不监听任何端口。
- 在 Electron 主进程内启动 Node HTTP 服务，默认 `0.0.0.0:3000`（可用 `MYOUTSIDE_LAN_PORT` 改端口），与内核同进程，直接调用 `kernel.handle`。
- 路由：
  - `/shell/`：外壳页面；
  - `/apps/<id>/`：子应用界面；
  - `/__myoutside/call`：浏览器版 `window.outside.call` 的 JSON POST 入口；
  - `/__myoutside/bridge.js`：注入到每个 HTML 的浏览器 bridge。
- 子应用 UI 目录按约定 `apps/<id>/ui` 从 `kernel.listApps()` 自动登记；新增游戏应用只要按同一约定放界面，就会同时出现在 Electron 和 LAN 预览里。
- 浏览器里 `window.outside.call` 用 `fetch` 发到 `/__myoutside/call`；`openExternal` 改成 `window.open`。这是 request / response，没有服务端推送。
- 外壳根据 `location.protocol` 选择 `app://<id>/index.html` 或 `/apps/<id>/index.html`；Electron 行为不变。
- 不做鉴权、不做 TLS；只用于作者自己的可信热点。Electron 退出时服务随之退出。

## 考虑过、没有采用

- **独立 Node 服务 + 另开数据库**：会和 Electron 主进程各自持有一个内核/数据库，数据不同步；如果共用同一个 SQLite 文件，又会绕过内核的单写者队列。没有采用。
- **只起静态服务器**：浏览器里没有 `window.outside`，子应用会显示 “Please open this page inside MyOutside”，不可用。
- **WebSocket 传输**：更接近 D-0012 描述的未来传输，但对当前的 request / response 调用来说代码更多；先做 HTTP POST，等游戏需要推送或更低延迟时再换。
- **云端内核（D-0013）**：正式多端方向，但需要服务器、登录、TLS，飞机上没有公网，太重。

## 代价

- 没有鉴权。调用者按发起调用的页面确定（Referer：`/shell/` 为外壳，`/apps/<id>/` 为该子应用，认不出的拒绝），再按内核的权限规则检查（D-0070）；局域网来的调用一律按**远程调用**处理：不能调用只给外壳的平台 API（例如修改平台设置、换掉 API key）。API key 任何调用者都读不到。
- 剩下的风险：Referer 可以伪造，同一热点下的设备可以冒充某个子应用，读写它的数据——例如冒充对话读对话记录、调用 `dialog.send` 花费 API 额度。只在可信热点使用。
- 局域网 HTTP 不是安全上下文：摄像头/麦克风、Gamepad、Wake Lock、Service Worker、剪贴板等 API 可能不可用；Canvas/WebGL、WebSocket（如果以后加）、Web Audio 正常。
- 外壳是桌面布局（210px 固定侧栏），手机上的体验需要子应用自己适配；游戏界面应按移动端设计。
- 没有推送；需要实时的游戏只能轮询，或者以后加事件通道。
- UI 目录是 `apps/<id>/ui` 的约定，等 D-0056 的应用清单落地后应改为由清单提供。

## 什么时候应该重新考虑

- 正式多端（D-0013 / D-0020）开始实施时，用云端内核 + 正式传输替换这个开发预览。
- 游戏需要实时推送、房间广播或更低延迟时，把 bridge 换成 WebSocket / 事件通道。
- 需要在不可信网络（咖啡厅、酒店、公共热点）使用时，加鉴权与 TLS。
- 应用清单（D-0056）落地时，改用清单描述 UI 与后台，不再按目录约定自动登记。

## 修订记录

- 2026-10-27：局域网调用改为按页面识别调用者、按远程调用检查权限（原先以平台内部身份调用，绕过了 D-0070 的权限检查）。
