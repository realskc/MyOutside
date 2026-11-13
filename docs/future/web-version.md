# 服务器版 MyOutside（第 2 步第一段：用测试数据上线）

> 2026-11-11 第一次部署到服务器（空库，只等作者建账号）。作者的预期见 `user-spec/platform.md`「多端」「分发与隔离」；依据：D-0013（云端内核）、D-0090（沙箱 iframe）、D-0091（每个用户一个库）、D-0093（登录与安全）、D-0092（备份，第二段）。服务器本身见 `docs/server.md`。

## 1. 范围

- 上服务器的子应用：学英语、对话、围棋、哲野（云端应用）。纯蓝、网易云下载留在本地 Electron，第 4 步再接（platform.md「分发与隔离」：本地 app 理论上是连服务器的客户端，网易云下载这类另有考虑）。
- 数据：全新的空库，只有作者一个账号。真实数据等第三段（先有备份）。
- Electron 这一段不改；局域网预览（D-0072）先不动。

## 2. 部件与位置

| 部件 | 在哪 |
|---|---|
| 服务端程序（Node，不依赖 Electron） | 服务器，只监听 `127.0.0.1:8787`；Caddy 把 `myoutside.org` 转给它 |
| 平台库 `platform.db`：用户、登录会话、一次性设置链接、邀请链接、服务器设置（试用阶段共用的 AI key 的密文，D-0097） | 服务器 `/var/lib/myoutside/` |
| 每个用户的库 `users/<用户 id>/myoutside.db`（D-0091） | 同上 |
| 主密钥（加密 API key 用） | `/var/lib/myoutside/secrets/master.key`，只有 `myoutside` 账号能读 |
| 外壳网页（登录页、子应用面板、消息桥、设置页） | 浏览器，`https://myoutside.org/` |
| 子应用界面 | 浏览器里的沙箱 iframe，地址 `/apps/<应用 id>/…` |

服务端程序复用现有的内核（`packages/kernel`、`kernel-node`）和子应用后端，新增：

- **内核管理器**：`kernelFor(用户 id)`——第一次用时为这个用户建内核、注册云端应用、跑迁移；闲置 30 分钟、且没有进行中的调用时关掉；
- **SecretCodec 的服务器实现**：用主密钥做 AES-256-GCM，代替 Electron 的 safeStorage（D-0075）；
- **登录**（D-0093）、**WebSocket 传输**、**静态文件**（外壳、子应用界面；子应用页面带 `Content-Security-Policy: sandbox allow-scripts allow-forms allow-modals allow-downloads` 和 `Access-Control-Allow-Origin: *`（无名源要跨源加载字体），并注入桥脚本）。界面的静态文件不要求登录（D-0093），数据都经 WebSocket。

### 代码在哪

| 文件 | 内容 |
|---|---|
| `apps/server/src/server.ts` | HTTP 路由、登录、设置密码、WebSocket |
| `apps/server/src/accounts.ts` | 平台库：账号、会话、设置链接（令牌只存哈希） |
| `apps/server/src/kernels.ts` | 内核管理器（每个用户一份，闲置关掉） |
| `apps/server/src/cloud-apps.ts` | 上服务器的子应用 |
| `apps/server/src/password.ts`、`rate-limit.ts`、`secrets.ts` | 密码哈希、限次数、API key 加密 |
| `apps/server/src/trial.ts` | 试用阶段（D-0097）：共用的 AI key、朋友每周的额度、各用户的花费 |
| `apps/server/src/backup-status.ts` | 读备份程序写的状态（D-0096） |
| `apps/server/src/main.ts` | 命令行：`serve`、`create-user`、`setup-link`、`invite` |
| `apps/server/web/` | 登录页、设置密码页、邀请注册页（`join.html`）、`client.js`（外壳一侧）、`bridge.js`（子应用一侧） |
| `apps/host/renderer/shell.js` | 外壳（和 Electron 共用）；服务器版下用 `client.js` 的 `mountApp` 打开子应用 |

### 本机试用

```bash
pnpm --filter @myoutside/server dev                        # 用系统临时目录里的数据，http://localhost:8787
pnpm --filter @myoutside/server admin create-user <用户名> --dev   # 打印设置链接
MYOUTSIDE_CHECK_SETUP=<设置链接> apps/host/node_modules/.bin/electron apps/server/scripts/browser-check.cjs  # 浏览器里的检查（后台运行）
```

## 3. 一次调用怎么走

```
子应用界面 outside.call(name, payload, { runId })
  → postMessage 给外壳
外壳：按 event.source 是自己建的哪个 iframe，认出调用的子应用（D-0090）
  → WebSocket：{ t: "call", id, runId, app, call, payload }
服务端：按登录会话找到用户 → 这个用户的内核
  → kernel.handle({ call, payload }, { caller: app, emit, signal })
  ← 进度 { t: "event", runId, event }（可能多条）
  ← 结果 { t: "result", id, response }
外壳 → postMessage 回对应的 iframe
取消：{ t: "cancel", runId }
```

- 调用者由外壳给出；服务端只信外壳（同源页面 + 登录会话）。外壳自己的调用（例如设置页）调用者是 `shell`。
- 只有登录后才能连 WebSocket，且请求必须来自 `https://myoutside.org` 的页面。
- 断线：调用在服务端照常跑完；外壳自动重连；断线期间的进度收不到，子应用需要时从数据里读（和现在切走面板一样）。
- 一条连接承载所有调用，不用每次重新建连接（作者在公司电脑上每来回一次约 0.4 秒，见 `docs/server.md`）。

## 4. 子应用界面的变化

- `window.outside` 由桥脚本提供，调用面不变：`call`、`newRunId`、`onEvent`、`cancel`、`openExternal`（由外壳打开）。
- 新增 `outside.storage`（`get` / `set` / `remove`，异步，值是字符串，单个值最大 1 MB）：沙箱里没有 localStorage，由外壳按子应用分开存在它自己的 localStorage 里（键 `mo.app.<应用 id>.<键>`），只在这台浏览器上。已改用它（没有时退回 localStorage，Electron 里照旧）：
  - 围棋的座位令牌；
  - 对话实验室的草稿和编辑模式。
- 外壳侧栏多一个「退出登录」按钮（`client.js` 加的）。
- 设备功能（选文件、在访达里显示、用本地编辑器打开）网页版没有：哲野的「在编辑器里打开」按钮已经按 `typeof window.outside.openAppFile` 判断，没有时不显示。哲野的配方跟着部署的代码走：改了配方要部署才生效。
- 跨用户的功能先不做：围棋只能在同一个账号的不同设备之间下（例如作者的电脑对作者的手机）；和朋友下要另外设计（D-0091「代价」）。

## 5. 服务器上的布置

- Node 24 LTS（官方发行版）；系统账号 `myoutside`；
- 代码：`/opt/myoutside/releases/<时间>/`（打包好的服务端 + 界面文件），`/opt/myoutside/current` 指向当前版本；
- 数据：`/var/lib/myoutside/`；备份的状态：`/var/lib/myoutside-backup/status.json`（D-0096）；
- systemd：`myoutside.service`，`User=myoutside`，沙箱选项（D-0093），崩溃自动重启；
- Caddy：`myoutside.org` 从占位页改成 `reverse_proxy 127.0.0.1:8787`，登录相关路径限请求大小（D-0093）；
- fail2ban：加一个登录失败的规则（D-0093）。

## 6. 部署（每次都要作者明确同意，AGENTS.md 红线 4）

1. 请作者同意时说明：这次改了什么、会打断什么（只换界面 / 重启整个服务），服务器上有没有正在进行的任务（试用阶段起，也包括朋友的）；
2. 作者同意后：在 Mac 上打包 → 传到服务器的新 `releases/` 目录 → 停止接新调用、等进行中的调用结束（有上限）→ 备份数据（服务器本地拷一份；R2 配置好以后再传一份，D-0096）→ 切换 `current` → 重启 → 检查（登录页能打开）→ 检查失败自动切回上一个版本。

## 7. 开发与检查

- 本机：`pnpm server:dev` 在 Mac 上用临时数据目录跑同一套服务端，浏览器打开 `http://localhost:8787`；
- 冒烟：Electron 在后台开隐藏窗口加载本机服务端的网页版，检查登录、外壳、四个子应用、沙箱（一个子应用读不到另一个、冒充被拒）——沿用 D-0046 的做法（不打扰作者、不碰真实数据）；
- 单测：传输、登录、限次数、会话、内核管理器，以及 D-0093「怎么验证」里的攻击。

## 8. 实施顺序

1. ✅ 服务端骨架：HTTP、静态文件、平台库与登录、WebSocket、内核管理器；本机跑通；
2. ✅ 外壳网页版：登录页、沙箱 iframe、消息桥、`outside.storage`、设置页；围棋、对话实验室改用 `outside.storage`；Chromium 里实测通过（D-0090「实测」）；
3. 安全：大小限制、限次数、会话已有单测（D-0093「怎么验证」）；还要：把浏览器检查并进冒烟、Safari / Firefox 实测；
4. ✅ 服务器环境：Node、`myoutside` 账号、目录、systemd、Caddy 转发、fail2ban 规则（`server-setup.sh` + 每次部署的 `activate-release.sh`）；
5. ✅ 第一次部署（2026-11-11，作者同意后）；从外面检查过：登录页、跳转、子应用页面关进沙箱、没登录拿不到数据、两百万位长的用户名被 Caddy 挡掉、WebSocket 没登录 / 伪造登录 / 别的网站都被拒。作者已建好账号 `admin`（管理员）、设了密码、登录过（2026-11-11）。还差：填 API key、在各台设备（含 Safari、iPhone）上试用。

之后：

- ✅ 第二段备份（D-0092、D-0096）：2026-11-13 部署程序，2026-11-14 配好 R2、第一次备份成功、恢复演练通过（`docs/server.md`「R2 备份」）；
- 试用阶段的准备（D-0097，product.md「试用阶段」）：2026-11-14 部署（作者同意后）；等作者在设置里填共用的 key、发第一份邀请——
  - 大家共用作者的 AI key：管理员在设置里填（显示为「大家共用」），存在平台库，别人的设置里没有这一栏；
  - 朋友每周最多 ¥20（北京时间周一 0 点重新算），发请求前检查，超了报「本周的 AI 额度用完了」；朋友的设置里显示本周已用多少；
  - 邀请注册：管理员在设置里生成邀请链接（7 天、用一次），朋友自己起用户名、设密码（`/__myoutside/join`）；
  - 管理员在设置里能看到每个用户本周和一共的花费；
- ✅ 第三段搬真实数据（D-0098）：2026-11-14 把 Mac 和 ThinkBook 的四个云端应用的数据合并（两边没有重复），作者确认后放进作者的 `realskc` 账号；之后以服务器为准，本地 Electron 不再装这四个子应用，本机的那一份备份后清掉（`scripts/cleanup-local-cloud-apps.mjs`，两台都清完就删掉脚本）。
