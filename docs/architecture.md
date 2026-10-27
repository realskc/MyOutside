# 架构与协议（v0）

> 技术文档：描述当前实现与已定的技术设计。作者的预期见 `user-spec/`，设计依据见 `user-spec/decisions/`（文中以 D-NNNN 引用）。

## 1. 总览

```
子应用界面（iframe，app://<id>/）
   │ window.outside.call(name, payload)          ← preload 暴露
   ▼
Electron IPC "kernel:call"
   ▼
内核 kernel.handle({ call, payload })
   ├─ 参数校验（zod）
   ├─ 只读 API：直接执行（可异步）
   └─ 事务 API：串行队列 → 单个数据库事务 → 提交后 DataVersion + 1
   ▼
SQLite 单文件（<userData>/myoutside.db）
```

- 全部持久状态 = 一个 SQLite 数据库（+ 将来的文件仓库目录，见 §9）。内核是唯一写入者，所有写操作串行执行（D-0004）。
- 每个子应用 = 后端（拥有私有数据、对外提供 API 函数，运行在 Electron 主进程内）+ 前端（Web，只经自己的后端访问数据）。
- 子应用之间只能调用对方的 API 函数（D-0006）；数据按应用划分，禁止共用表（D-0005）。
- 内核、契约与子应用后端不依赖 Electron / 浏览器专有 API（D-0012）。

### 包结构（pnpm workspace）

| 包 | 内容 |
|---|---|
| `packages/contracts` | 契约：各应用 API 的输入 zod schema 与类型、`ApiMap`（全部函数名 → 输入 / 输出） |
| `packages/kernel` | 内核：注册、迁移、调用路由、串行队列、AppDb、平台内置 API（含平台 AI） |
| `packages/kernel-node` | Node 存储适配器（`node:sqlite` 的 `DatabaseSync`） |
| `apps/vocab`、`apps/dialog` | 子应用：`backend/`（AppModule）、`ui/`（静态界面，D-0011）、`test/` |
| `apps/go` | 围棋子应用：`backend/`（9 路规则、联机、悔棋、棋谱）、`ui/`（Canvas 棋盘 + 聊天）、`user-spec/`、`docs/`；应用自包含，见 D-0073 |
| `apps/host` | Electron 程序：主进程、preload、外壳界面（`renderer/`） |

## 2. 子应用模块（AppModule）

```ts
interface AppModule {
  id: string;                 // "vocab"
  name: string;               // 显示名
  owns?: string[];            // 拥有的逻辑表名（目前仅声明，不做强制校验）
  migrations?: Migration[];   // { id, up(ctx: MigrationCtx) }
  api: Record<string, ApiDefinition>;  // 短名 → 定义；全名为 `${id}.${短名}`
}
```

- 函数用 `defineTx(schema, handler)` / `defineRead(schema, handler)` 定义（`packages/kernel/src/api.ts`）。
- Electron 主进程在启动时 `kernel.registerApp(...)` 注册全部子应用，再 `kernel.start()`；注册必须在 start 之前。
- 子应用界面目录由 Electron 主进程硬编码登记（`apps/host/src/main/index.ts` 的 `uiDirs`）。
- 每个子应用一份清单 `manifest.json`，以 `kernel.registerApp(app, manifest)` 注册（§2.1）。

### 2.1 应用清单（D-0056、D-0070）

每个子应用一份 `apps/<id>/manifest.json`：

```json
{
  "id": "dialog",
  "name": "对话",
  "protocolVersion": 1,
  "ui": "ui/index.html",
  "backend": "backend/src/index.ts",
  "owns": ["conversation", "message"],
  "uses": ["platform.ai.chat", "platform.web.search", "platform.web.fetch"]
}
```

- 描述性字段：平台据此自动发现与装载应用（替代硬编码的导入、注册与 `uiDirs`）；协议版本不兼容时拒绝装载；
- `owns`：登记表的归属（供临时函数作用域检查、删除应用时清理数据等使用）；应用访问数据的限制本身由 AppDb 的表名前缀在结构上保证（§5.1），不依赖 `owns`；
- `uses`：内核按调用者检查跨应用调用（D-0053，`docs/agent.md` §7.2）；
- API 函数与迁移仍由后端代码（AppModule）提供。

## 3. 函数与调用（D-0006、D-0007、D-0063）

### 3.1 API 的种类

**规则：写数据只能发生在内核管理的短事务里，即只能通过事务 API。**

| 种类 | 执行方式 | 约束 | 可见性 |
|---|---|---|---|
| 事务 API（`tx`） | 进入串行队列，在一个数据库事务内执行 | **同步、纯数据**：只读写自己的表，不做文件 / 网络副作用；返回 Promise 会被拒绝（`INTERNAL`） | 公开或内部 |
| 只读 API（`read`） | 直接执行 | 可以异步（例如调用平台 AI）；不能写数据 | 公开或内部 |
| 普通的异步函数（`async`，`defineAsync`，D-0063） | 直接执行 | 可以异步；**写数据只能通过调用本子应用的事务 API**（每次一个独立的短事务）；整体不保证原子 | **只能是内部** |

- 只读 API 与普通的异步函数拿到的 `ctx.db` 是**只读句柄**，写入方法抛出 `FORBIDDEN`；
- 普通的异步函数的 `ctx.call` 可以调用只读 API、本子应用的事务 API（各自进写队列、独立成事务）与本子应用的异步函数；只有本子应用（前端、后端）能调用它；
- 定义时默认是内部 API，公开需显式声明：`defineTx(schema, handler, { visibility: "public" })`；
- 步骤之间的一致性由子应用在事务 API 里做提交时校验（例如「当前末端仍是我开始时的那个节点」），冲突时拒绝写入（§7.1）。

### 3.2 调用

- 界面：`window.outside.call(name, payload)` → `KernelResponse`：
  ```ts
  | { ok: true; result: unknown; dataVersion: number }
  | { ok: false; error: { code; message; details? }; dataVersion: number }
  ```
- 事务 API 内：`ctx.call(name, payload)`——同步，只能调用事务 API，与本次写入同属一个事务（跨应用原子落账）。
- 只读 API 内：`await ctx.call(name, payload)`——只能调用只读 API。
- 每次调用都会按目标函数的 schema 校验参数；嵌套调用深度上限 8（`CALL_DEPTH_EXCEEDED`）。
- 判断规则：这次调用需要与我的写入同生共死吗？需要 → 事务 API 里 `ctx.call`；不需要 → 只读 API / 界面调用。
- 没有通用的跨应用查询接口：读别人的数据 = 调用对方暴露的查询函数。

### 3.3 错误

错误码（`packages/kernel/src/errors.ts`）：`UNKNOWN_FUNCTION`、`VALIDATION`、`TX_CALL_INVALID`、`CALL_DEPTH_EXCEEDED`、`NOT_FOUND`、`PRECONDITION`、`UPSTREAM`、`INTERNAL`。事务 API 抛错 → 整个事务回滚。

### 3.4 权限（D-0053、D-0070）

调用者：前端发起时由 Electron 主进程按 `senderFrame.url`（`app://<id>/`）确定；后端发起时是正在执行的函数所属的子应用；`app://shell/` 为外壳；直接调用内核视为平台内部（受信任）。

| 被调用的函数 | 规则 |
|---|---|
| 自己的函数 | 不受限 |
| 平台 API | 子应用需在清单 `uses` 里声明；`platform.settings.set` 只给外壳 |
| 其他子应用的 API | 必须是公开 API，且在清单 `uses` 里声明 |
| （外壳调用子应用的 API） | 拒绝 |

拒绝时错误码 `FORBIDDEN`。平台设置中的凭据（`ai.deepseek.apiKey`）任何调用者读到的都是 `{ value: null, isSet }`。

**远程调用**（`handle(request, { caller, remote: true })`，目前只有局域网预览，D-0072）：必须带调用者；不能调用只给外壳的平台 API（身份是对方报上来的，可以伪造）。局域网预览按 Referer 确定调用者（`/shell/` → 外壳，`/apps/<id>/` → 子应用）。

## 4. 事务与数据版本（D-0004）

- `enqueue`：所有写调用排成一条 Promise 链，顺序执行；
- 每个写调用：`storage.transaction(() => runTx(...))`，成功后 `dataVersion += 1`；
- DataVersion 只在内存中计数（进程重启后从 0 开始），用于刷新比对；
- 「一次事件多处落账」：发起方的事务 API 内 `ctx.call` 其他应用的事务 API，全部在同一事务中提交，不需要两阶段提交。

示例（规划中的抓词，见 `apps/dialog/docs/README.md` §8）：

```
dialog.captureWord（写）
  ├─ 写 dialog 自己的表
  └─ ctx.call("vocab.addCard", {...})   ← 同一事务
提交 → DataVersion + 1
```

## 5. 数据访问（D-0005）

### 5.1 AppDb

子应用通过 `ctx.db` 访问数据；逻辑表名自动加前缀：`card`（应用 vocab）→ 物理表 `vocab__card`。

```ts
insert(table, row) / update(table, patch, where) / delete(table, where)
get(table, where) / all(table, where?, { orderBy?, limit?, offset? }) / count(table, where?)
```

- `where`：标量表示相等；或操作符对象 `{ eq, lt, lte, gt, gte, like, in }`；
- `update` / `delete` 必须带 `where`；`limit` 上限 1000；标识符做白名单校验。

### 5.2 迁移

- 每个应用携带有序的迁移列表，只操作自己的表；
- `kernel.start()` 时在**一个事务**内执行全部未执行过的迁移，记录到 `platform_migration(app_id, migration_id, applied_at)`；失败整体回滚；
- `MigrationCtx`：`createTable`、`createIndex`（自动加前缀）、`insert`（种子 / 参考数据，例：vocab 的托福词表，VOCAB-0005）、`exec`（逃生口，不加前缀，谨慎使用）。

### 5.3 平台自己的表

- `platform_migration`：迁移记录；
- `platform_setting(key, value JSON, updated_at)`：平台设置（界面语言 `ui.language`、`ai.deepseek.apiKey` / `baseUrl` / `model`）。

## 6. 平台 API

| 函数 | 类别 | 访问 | 说明 |
|---|---|---|---|
| `platform.dataVersion` | 只读 | 子应用（需声明） | 当前 DataVersion |
| `platform.listApps` | 只读 | 子应用（需声明） | 已注册子应用 `{ id, name }[]` |
| `platform.settings.get` | 只读 | 子应用（需声明） | 平台设置；凭据返回 `{ value: null, isSet }`（D-0053） |
| `platform.settings.set` | 事务 | 只给外壳 | 修改平台设置 |
| `platform.ai.chat` | 只读 | 子应用（需声明） | DeepSeek 对话（D-0014） |
| `platform.web.search` | 只读 | 子应用（需声明） | DeepSeek 网页搜索（D-0050） |
| `platform.web.fetch` | 只读 | 子应用（需声明） | DeepSeek 网页抓取，返回 Markdown 正文（D-0050） |

实现：`packages/kernel/src/platform-ai.ts`、`platform-web.ts`、`deepseek.ts`（密钥读取、请求、错误整理、SSE 解析）。

### 6.1 `platform.ai.chat`

- 输入：`messages`（OpenAI 形状：`assistant.tool_calls`、`tool` 角色、**`assistant.reasoning_content` 回传**）、`tools?`（透传）、`model?`、`temperature?`、`reasoningEffort?`（none / low / high / max；`none` 即关闭思考）、`stream?`；
- 输出：`{ content, reasoning, toolCalls, model, usage, finishReason, message }`；`message` 是可直接追加进历史的 assistant 消息（含 `reasoning_content`）；`usage` 含 reasoning tokens 与缓存命中 tokens；
- **流式**（`stream: true`）：经 SSE 接收，增量经推送通道发出 `{ type: "ai_delta", content?, reasoning? }`；工具调用参数分片到达时按 index 拼装；最终仍返回完整结果；
- **DeepSeek 规则**：请求带 `tools` 时，历史中每一轮的 `reasoning_content` 都必须回传，否则 400（已用真实接口验证两轮工具调用可行）；思考模式下不支持 `tool_choice` 的强制调用（D-0059，不使用）；
- 默认 base URL `https://api.deepseek.com`，默认模型 `deepseek-flash`。

### 6.2 `platform.web.search` / `platform.web.fetch`

- 搜索输入：`query`（1～128 字符，支持 `site:` / `lang:` / `after:` / `before:` 等语法）、`count?`（默认 8）、`needContent?`、`oriQuestion?`；输出 `results[]`：`title`、`url`、`snippet`（短摘要，给界面）、`summary`（长摘要，给模型）、`content`、`siteName`、`date`、`score`（0～3，≥1.5 优质）、`authority`（0～4）；
- 抓取输入：`url`（http/https）；输出 `{ title, content }`（Markdown）；
- 计费：各 5 元 / 千次成功请求（搜索无结果不计费）；QPS 100 / 25。

### 6.3 错误与取消

- 网络错误、408 / 429 / 5xx → `UPSTREAM`，`details.retryable = true`；其余 HTTP 错误 → `UPSTREAM`，`details.status`、`retryable = false`；401 → `PRECONDITION`（密钥无效）；未配置密钥 → `PRECONDITION`；
- 调用被取消时中止发往 DeepSeek 的请求（流式请求断开后 DeepSeek 会停止生成）：非流式以 `ABORTED` 结束；**流式返回已收到的部分**，`finishReason = "aborted"`（未拼完的工具调用丢弃，拿不到用量），由调用方决定要不要保留（DIALOG-0017）；流式中途出错（例如断网）照常报错，已收到的部分放在 `details.partial = { content, reasoning }`（DIALOG-0018）。
- 取消只是通知正在执行的函数「该停了」：内核不因取消而拒绝之后的写入，函数停下来后可以经本应用的事务 API 保存已有的进度。

### 6.4 用量计量

每次成功调用按**调用者**记一条到 `platform_usage`（`caller`、`kind`：`ai.chat` / `web.search` / `web.fetch`、`model`、各类 token 数、时间），经写队列写入，不改变 DataVersion。为将来按子应用的用量显示与管控打基础。

## 7. AI 辅助的写操作（D-0008）

先解析（只读 API，异步，可调平台 AI，不落库）→ 再提交（事务 API）；两步之间由前端编排。实例：`vocab.resolveCard → vocab.addCard`、`dialog.generateReply → dialog.appendMessage`。

### 7.1 编写子应用时的指引：又慢、又需要原子性的操作

原子的单位永远是**一个短事务**（一次事务 API 调用）。事务 API 不能等外部，否则会挡住所有其他写入；外部动作（调 AI、发请求）也无法回滚。需要「慢的外部操作 + 原子写入」时：

- **先慢后快，提交时校验**：慢的外部操作先做（在只读 API 里，不在事务内）；最后用一个短事务提交，**提交时重新检查前提是否仍成立**（例如「这个词仍然没有卡片吗」），不成立就报错或让用户决定。当前 `vocab.addCard` 尚未做这一步校验。
- **拆成多个短事务，失败时补偿**：长流程拆成一串各自原子的短事务；后续步骤失败或用户反悔时，撤销前面已完成的步骤。将来的后台任务可由内核自动撤销整次任务写过的数据（`docs/agent.md` §8.2）。
- 慢的部分如果本身不写数据（例如抓词时先让 AI 生成卡片草稿），直接「先生成、后一次事务写入」即可。

这些属于编写子应用与 API 时的考虑；系统层只提供「事务 API 同步执行、只读 API 可以异步」这一基础（D-0007）。

## 8. 刷新模型（D-0009）

- 不推送；切换子应用时外壳重新加载面板，子应用加载时拉取数据；
- 外壳每 3 秒轮询 `platform.dataVersion` 显示在界面上；
- 可选增强：提交后给活动面板发轻量通知。

## 9. 文件仓库（设计，未实现）

- 布局：`<data>/files/<appId>/<uuid>`；数据库记录 `files.file(id, appId, path, mime, size, sha256, created_at)`；文件同样归属唯一应用；
- 写入：先落盘临时文件 → 计算校验和 → 事务登记 → 原子改名；
- 删除：事务内删元数据并写入 `files.pending_delete`，后台任务删物理文件；
- 原则：**先库后文件，允许孤儿文件，禁止幽灵引用**（库里有记录、盘上无文件）；启动时清理待删队列与临时文件。

## 10. Electron 程序（apps/host）

- 主进程（`src/main/index.ts`）：创建内核与存储、按清单注册子应用、识别调用者、IPC（`kernel:call`、`kernel:cancel`、`host:openExternal`）、推送事件（`kernel:event`）、`app://` 协议、菜单、冒烟模式；
- 界面（D-0018）：外壳页面 `app://shell/index.html`，一个 iframe 作为面板，切换时改 `src`；`app://<id>/` 映射到各应用 `ui/` 目录，带路径穿越检查；
- preload（`src/preload/index.ts`）：`window.outside = { call(name, payload, { runId }), newRunId, onEvent(runId, listener), cancel(runId), openExternal }`；
- 外链：`host.openExternal` 只接受 http/https，用系统浏览器打开；
- 菜单：文件 / 编辑 / 视图；「编辑」菜单让 macOS 上的剪贴板快捷键生效；中英文跟随 `ui.language`；
- 单实例锁（D-0016）；数据目录：`app.getPath("userData")`（应用名 MyOutside）；
- 冒烟模式（`pnpm smoke`，`MYOUTSIDE_SMOKE=1`）：复制真实数据库到临时目录，自检外壳与各子应用、做演示写入、截图后退出；默认后台运行（窗口不显示、不抢焦点），`MYOUTSIDE_SMOKE_SHOW=1` 时显示；使用独立的临时配置目录、打包到独立的 `dist-smoke/`，可与正在运行的 MyOutside 同时运行、互不影响（D-0046）；
- LAN 预览（`pnpm dev:lan`，D-0072）：主进程额外启动 HTTP 宿主，服务外壳与 `apps/<id>/ui`，并注入浏览器版 `window.outside`（`POST /__myoutside/call` → `kernel.handle`）；默认不启用，无鉴权，仅供可信热点上的临时多设备调试；不是正式多端方案（正式方向见 D-0013）；
- 构建：`scripts/build.mjs`（esbuild 打包主进程与 preload）、`scripts/run.mjs`（启动 Electron）。

## 11. 未实现 / 待定

1. 自动发现与装载子应用（目前在主进程代码里逐个注册清单与模块）；`owns` 的使用。
2. builder 修改清单的批准流程。
3. 按子应用热重载 `reloadApp`（D-0017）：每个子应用独立产出后端模块，运行时只重载一个应用。
4. API 函数的版本策略。
5. 事务 API 的副作用：如需要，走提交后钩子（post-commit）或补偿，不得混入事务。
6. （已实现）普通的异步函数、只读句柄、权限检查。
7. 事件 / 消息总线（暂缓）。
8. 子应用形态允许混合（Web 内容 / 将来进程化 / WASM），呈现层统一为 Web。
9. 文件仓库（§9）。
