# 架构与协议（v0）

> 技术文档：描述当前实现与已定的技术设计。用户的预期见 `user-spec/`，设计依据见 `user-spec/decisions/`（文中以 D-NNNN 引用）。

## 1. 总览

```
子应用界面（iframe，app://<id>/）
   │ window.outside.call(name, payload)          ← preload 暴露
   ▼
Electron IPC "kernel:call"
   ▼
内核 kernel.handle({ call, payload })
   ├─ 参数校验（zod）
   ├─ 读函数：直接执行（可异步）
   └─ 写函数：串行队列 → 单个数据库事务 → 提交后 DataVersion + 1
   ▼
SQLite 单文件（<userData>/myoutside.db）
```

- 全部持久状态 = 一个 SQLite 数据库（+ 将来的文件仓库目录，见 §9）。宿主是唯一写入者，所有写操作串行执行（D-0004）。
- 每个子应用 = 后台模块（拥有私有数据、对外提供 API 函数，运行在宿主进程内）+ 前台界面（Web，只经自己的后台访问数据）。
- 子应用之间只能调用对方的 API 函数（D-0006）；数据按应用划分，禁止共用表（D-0005）。
- 内核、契约与子应用后台不依赖 Electron / 浏览器专有 API（D-0012）。

### 包结构（pnpm workspace）

| 包 | 内容 |
|---|---|
| `packages/contracts` | 契约：各应用 API 的输入 zod schema 与类型、`ApiMap`（全部函数名 → 输入 / 输出） |
| `packages/kernel` | 内核：注册、迁移、调用路由、串行队列、AppDb、平台内置 API（含平台 AI） |
| `packages/kernel-node` | Node 存储适配器（`node:sqlite` 的 `DatabaseSync`） |
| `apps/vocab`、`apps/dialog` | 子应用：`backend/`（AppModule）、`ui/`（静态界面，D-0011）、`test/` |
| `apps/host` | Electron 宿主：主进程、preload、外壳界面（`renderer/`） |

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
- 宿主在启动时 `kernel.registerApp(...)` 注册全部子应用，再 `kernel.start()`；注册必须在 start 之前。
- 子应用界面目录由宿主硬编码登记（`apps/host/src/main/index.ts` 的 `uiDirs`）。
- 尚未实现：独立的应用清单（D-0056），见 §11。

### 2.1 应用清单（规划，D-0056）

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

- 描述性字段：宿主据此自动发现与装载应用（替代硬编码的导入、注册与 `uiDirs`）；协议版本不兼容时拒绝装载；
- `owns`：登记表的归属（供临时函数作用域检查、删除应用时清理数据等使用）；应用访问数据的限制本身由 AppDb 的表名前缀在结构上保证（§5.1），不依赖 `owns`；
- `uses`：内核按调用者检查跨应用调用（D-0053，`docs/agent.md` §7.2）；
- API 函数与迁移仍由后台代码（AppModule）提供。

## 3. 函数与调用（D-0006、D-0007）

### 3.1 两类函数

| 类别 | 执行方式 | 约束 |
|---|---|---|
| 写（`tx`） | 进入串行队列，在一个数据库事务内执行 | **同步、纯数据**：只读写自己的表，不做文件 / 网络副作用；返回 Promise 会被拒绝（`INTERNAL`） |
| 读（`read`） | 直接执行 | 可以异步（例如调用平台 AI）；不能写库 |

### 3.2 调用

- 界面：`window.outside.call(name, payload)` → `KernelResponse`：
  ```ts
  | { ok: true; result: unknown; dataVersion: number }
  | { ok: false; error: { code; message; details? }; dataVersion: number }
  ```
- 写函数内：`ctx.call(name, payload)`——同步，只能调用写函数，与本次写入同属一个事务（跨应用原子落账）。
- 读函数内：`await ctx.call(name, payload)`——只能调用读函数。
- 每次调用都会按目标函数的 schema 校验参数；嵌套调用深度上限 8（`CALL_DEPTH_EXCEEDED`）。
- 判断规则：这次调用需要与我的写入同生共死吗？需要 → 写函数里 `ctx.call`；不需要 → 读函数 / 界面调用。
- 没有通用的跨应用查询接口：读别人的数据 = 调用对方暴露的查询函数。

### 3.3 错误

错误码（`packages/kernel/src/errors.ts`）：`UNKNOWN_FUNCTION`、`VALIDATION`、`TX_CALL_INVALID`、`CALL_DEPTH_EXCEEDED`、`NOT_FOUND`、`PRECONDITION`、`UPSTREAM`、`INTERNAL`。写函数抛错 → 整个事务回滚。

### 3.4 已知差距

- 宿主不区分调用者：任何界面都能调用任何函数（包括 `platform.settings.get` 读取密钥）。见 D-0006、D-0019「代价」。

## 4. 事务与数据版本（D-0004）

- `enqueue`：所有写调用排成一条 Promise 链，顺序执行；
- 每个写调用：`storage.transaction(() => runTx(...))`，成功后 `dataVersion += 1`；
- DataVersion 只在内存中计数（进程重启后从 0 开始），用于刷新比对；
- 「一次事件多处落账」：发起方的写函数内 `ctx.call` 其他应用的写函数，全部在同一事务中提交，不需要两阶段提交。

示例（规划中的抓词，见 `docs/apps/dialog.md` §8）：

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
- `MigrationCtx`：`createTable`、`createIndex`（自动加前缀）、`insert`（种子 / 参考数据，例：vocab 的托福词表，D-0025）、`exec`（逃生口，不加前缀，谨慎使用）。

### 5.3 平台自己的表

- `platform_migration`：迁移记录；
- `platform_setting(key, value JSON, updated_at)`：平台设置（界面语言 `ui.language`、`ai.deepseek.apiKey` / `baseUrl` / `model`）。

## 6. 平台内置 API

| 函数 | 类别 | 说明 |
|---|---|---|
| `platform.dataVersion` | 读 | 当前 DataVersion |
| `platform.listApps` | 读 | 已注册子应用 `{ id, name }[]` |
| `platform.settings.get` / `set` | 读 / 写 | 平台设置（D-0019） |
| `platform.ai.chat` | 读 | DeepSeek 代理（D-0014） |

### 6.1 `platform.ai.chat`

- 输入：`messages`（OpenAI 形状，支持 `assistant.tool_calls` 与 `tool` 角色）、`tools?`（透传）、`model?`、`temperature?`、`reasoningEffort?`（none / low / high / max）；
- 输出：`{ content, reasoning, toolCalls, model, usage }`，`usage` 含 reasoning tokens；
- 密钥从平台设置读取；未配置 → `PRECONDITION`；网络 / HTTP 错误 → `UPSTREAM`；
- 默认 base URL `https://api.deepseek.com`，默认模型 `deepseek-flash`；
- **注意**：消息 schema 目前没有 `reasoning_content` 字段，会被校验丢弃。DeepSeek 在请求带 `tools` 的思考模式下要求回传历史 `reasoning_content`，否则 400——做 agent 循环前必须补上（D-0032）。

## 7. AI 辅助的写操作（D-0008）

先解析（读函数，异步，可调平台 AI，不落库）→ 再提交（写函数）；两步之间由界面编排。实例：`vocab.resolveCard → vocab.addCard`、`dialog.generateReply → dialog.appendMessage`。

## 8. 刷新模型（D-0009）

- 不推送；切换子应用时外壳重新加载面板，子应用加载时拉取数据；
- 外壳每 3 秒轮询 `platform.dataVersion` 显示在界面上；
- 可选增强：提交后给活动面板发轻量通知。

## 9. 文件仓库（设计，未实现）

- 布局：`<data>/files/<appId>/<uuid>`；数据库记录 `files.file(id, appId, path, mime, size, sha256, created_at)`；文件同样归属唯一应用；
- 写入：先落盘临时文件 → 计算校验和 → 事务登记 → 原子改名；
- 删除：事务内删元数据并写入 `files.pending_delete`，后台任务删物理文件；
- 原则：**先库后文件，允许孤儿文件，禁止幽灵引用**（库里有记录、盘上无文件）；启动时清理待删队列与临时文件。

## 10. 宿主（apps/host）

- 主进程（`src/main/index.ts`）：创建内核与存储、注册子应用、IPC（`kernel:call`、`host:openExternal`）、`app://` 协议、菜单、冒烟模式；
- 界面（D-0018）：外壳页面 `app://shell/index.html`，一个 iframe 作为面板，切换时改 `src`；`app://<id>/` 映射到各应用 `ui/` 目录，带路径穿越检查；
- preload（`src/preload/index.ts`）：`window.outside = { call, openExternal }`；
- 外链：`host.openExternal` 只接受 http/https，用系统浏览器打开；
- 菜单：文件 / 编辑 / 视图；「编辑」菜单让 macOS 上的剪贴板快捷键生效；中英文跟随 `ui.language`；
- 单实例锁（D-0016）；数据目录：`app.getPath("userData")`（应用名 MyOutside）；
- 冒烟模式（`pnpm smoke`，`MYOUTSIDE_SMOKE=1`）：复制真实数据库到临时目录，自检外壳与各子应用、做演示写入、截图后退出（D-0046）；
- 构建：`scripts/build.mjs`（esbuild 打包主进程与 preload）、`scripts/run.mjs`（启动 Electron）。

## 11. 未实现 / 待定

1. 应用清单（§2.1，D-0056）：自动装载、协议版本、`owns` 登记。
2. 调用者身份与 `uses` 权限检查（§3.4，D-0053）；被调用方是否需要声明「哪些函数允许别人调用」，暂不做。
3. 按子应用热重载 `reloadApp`（D-0017）：每个子应用独立产出后台模块，运行时只重载一个应用。
4. API 函数的版本策略。
5. 写函数的副作用：如需要，走提交后钩子（post-commit）或补偿，不得混入事务。
6. agent 循环中途写库的能力（D-0007「什么时候应该重新考虑」）。
7. 事件 / 消息总线（暂缓）。
8. 子应用形态允许混合（Web 内容 / 将来进程化 / WASM），呈现层统一为 Web。
9. 文件仓库（§9）。
