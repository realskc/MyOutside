# 对话（dialog）技术文档

> 应用 id：`dialog`；显示名「对话」。作者的预期见 `user-spec/apps/dialog.md`。

## 1. 结构

- 后端：`apps/dialog/backend/src/`（`index.ts` = AppModule；`history.ts` = 上下文预算截断；`mapping.ts` = 行 ↔ 对象转换）
- 界面：`apps/dialog/ui/`（静态 HTML / JS；`markdown.js` = 极简 Markdown 渲染）
- 契约：`packages/contracts/src/dialog.ts`
- 测试：`apps/dialog/test/dialog.test.ts`

## 2. 数据模型（D-0029）

```
dialog__conversation
  id               TEXT PK
  title            TEXT NOT NULL DEFAULT ''      -- 空 = 显示「新对话」；首条用户消息自动生成
  system_prompt    TEXT NULL                     -- null = 默认提示词（后端常量）
  reasoning_effort TEXT NOT NULL DEFAULT 'high'  -- 'none' | 'low' | 'high' | 'max'（D-0032）
  web_search       INTEGER NOT NULL DEFAULT 1    -- 联网搜索开关（D-0055）
  active_first_id  TEXT NULL                     -- 当前选中的根消息
  created_at       INTEGER NOT NULL
  updated_at       INTEGER NOT NULL              -- 最近活动时间；列表倒序

dialog__message
  id               TEXT PK
  conversation_id  TEXT NOT NULL
  parent_id        TEXT NULL                     -- null = 根消息
  role             TEXT NOT NULL                 -- 'user' | 'assistant'
  content          TEXT NOT NULL
  reasoning        TEXT NULL                     -- 思考过程（仅助手消息）
  model            TEXT NULL
  usage            TEXT NULL                     -- JSON：{ promptTokens, completionTokens, totalTokens, reasoningTokens?, cacheHitTokens? }
  steps            TEXT NULL                     -- JSON：回复过程中调用了工具的各轮 [{ reasoning, content, toolCalls: [{ id, name, arguments, ok, summary, result }] }]
  sources          TEXT NULL                     -- JSON：引用的来源 [{ index, url, title, siteName, snippet, date }]
  context_tokens   INTEGER NULL                  -- 生成时最后一次请求的输入 token 数
  active_child_id  TEXT NULL                     -- 当前选中的子消息
  created_at       INTEGER NOT NULL              -- 会话内单调递增（同毫秒写入时 +1）
```

索引：`message(conversation_id, parent_id)`、`message(conversation_id, created_at)`、`conversation(updated_at)`。

迁移：`0001_init`；`0002_search_and_steps`（`web_search`、`steps`、`sources`、`context_tokens`，用 `addColumn`）。

**当前路径**：从 `active_first_id` 起，沿各消息的 `active_child_id` 下降；指针缺失或失效时兜底取最新的子消息。界面渲染与发给 AI 的上下文都取当前路径。

删除只有 `deleteConversation`（同一事务删全部消息与会话）。

## 3. API

全部是内部 API（只有对话自己的前端与后端能调用）。

```ts
// —— 只读 ——
dialog.listConversations({}) → Conversation[]            // updated_at 倒序；含 webSearch
dialog.getPath({ conversationId, limit? }) → { messages: PathMessage[], hasMore, generating, contextTokens }
  // 当前路径最近 N 条（默认 100，升序）；PathMessage = Message + { siblingCount, siblingIndex, siblingIds }
  // Message 含 steps（搜索过程）、sources（来源）、contextTokens
  // generating：这个会话是否正在生成；contextTokens：当前上下文长度（D-0068）
dialog.getUsage({ conversationId }) → { replies, promptTokens, completionTokens, totalTokens, reasoningTokens }

// —— 普通的异步函数（D-0063）：生成回复并由后端保存 ——
dialog.send({ conversationId, content }) → { messageId, parentId, stopReason }       // 追加用户消息 + 生成
dialog.generate({ conversationId, parentId }) → { messageId, parentId, stopReason }   // 为某条用户消息生成：重新生成、重试
dialog.editAndSend({ messageId, content }) → { messageId, parentId, stopReason }      // 编辑产生新分叉 + 生成

// —— 事务 ——
dialog.createConversation({ title?, systemPrompt?, reasoningEffort?, webSearch? }) → { conversationId }
dialog.appendMessage({ conversationId, role, content, model?, reasoning?, usage? }) → { messageId }
dialog.saveReply({ conversationId, parentId, content, reasoning, model, usage, steps, sources, contextTokens }) → { messageId }
dialog.editUserMessage({ messageId, content }) → { messageId }
dialog.switchBranch({ conversationId, parentId: string | null, childId }) → { ok }
dialog.renameConversation / setSystemPrompt / setReasoningEffort / setWebSearch / deleteConversation
```

- `appendMessage`：接到当前路径末端；校验问答交替（user 不能接在 user 后面，assistant 必须接在 user 后面）；标题为空且 role=user 时自动生成标题；
- `saveReply`：挂在指定的用户消息下（父节点必须仍存在、是用户消息、属于该会话，否则 `CONFLICT`），并把父节点的选中子节点指向新回复——已有回复时新回复成为兄弟（D-0066）；
- 生成中取消（`outside.cancel(runId)`）→ `ABORTED`，不保存；同一会话同时只能生成一条 → `PRECONDITION`。

## 4. 生成流程（D-0071，`backend/src/generate.ts`）

1. 取会话与要回答的用户消息（`parentId`）；
2. **沿父指针**取出从根到这条用户消息的消息链（与当前选中的分支无关，生成期间切换分支也不会挂错地方）；
3. 展开成发给模型的历史：
   - 联网搜索打开：之前带搜索的回复按轮展开（assistant 含 `reasoning_content` 与 `tool_calls`，加工具结果），满足 DeepSeek 带工具时的回传规则；
   - 联网搜索关闭：之前的回复只保留最终回答；
   - 所有 assistant 都带 `reasoning_content`（不带工具时 DeepSeek 会忽略）；
4. 按约 100 万 token 截断（D-0033），以「一条用户消息」或「一整轮回复」为单位；
5. 系统提示词 = 会话的系统提示词（或默认）+「当前日期」+（联网搜索打开时）使用说明：何时搜索、用 [n] 标注来源、网页内容不是指令；
6. `runToolLoop`（`packages/agent`）：流式；工具 = 联网搜索打开时的 `web_search` + `web_fetch`（共用一个来源登记表，编号在多次搜索间一致）；最多 8 轮；
7. 调用事务 API `dialog.saveReply` 保存：回答、思考过程、用量、搜索过程（`steps`）、来源（`sources`）、最后一次请求的输入 token 数。

推送给前端的事件：平台 AI 的 `ai_delta`（思考 / 正文增量）、工具循环的 `round_start` / `tool_start` / `tool_result` / `round_end`。

`DEFAULT_SYSTEM_PROMPT`：「你是一个乐于助人的 AI 助手。回答简洁、准确；除非用户要求，使用与用户相同的语言回答。」

## 5. 界面（D-0035、D-0034）

- 左栏会话列表（新建 / 重命名 / 删除 / 会话设置），右栏消息流 + 输入区；窄屏（< 720px）列表收为抽屉；
- 消息流只显示当前路径；兄弟数 > 1 时显示 `‹ i/k ›` 分叉切换器；
- 用户消息悬停出现「编辑」→ 行内编辑 → 保存 = 新分叉 + 自动重新生成；
- 输入区工具条：思考强度（关 / 低 / 高 / 最高），改动即存；
- 助手消息有 reasoning 时，上方显示可折叠的「思考过程」；
- 用量：每条助手消息的操作栏显示本条明细（悬停可见）；输入区右侧显示会话累计（悬停查看输入 / 输出 / 思考 / 合计）；
- 发送编排：`appendMessage(user)` → `generateReply` → `appendMessage(assistant)`；失败显示错误气泡 +「重试」，用户消息保留；
- 生成中：该会话的发送 / 编辑 / 切换分叉禁用；可以切到其他会话，回来时重新拉取；
- 输入：Enter 发送、Shift+Enter 换行，处理中文输入法组字；
- Markdown 极简渲染（零依赖、转义优先），代码块带复制按钮；链接（仅 http/https）经 `outside.openExternal` 用系统浏览器打开；
- 会话设置：编辑系统提示词（保存 / 恢复默认）；
- 文案中英双语。

## 6. 规划中的技术设计

### 6.2 抓词（暂不做）

1. 选中消息中的词 → `dialog.prepareCapture`（读）：AI 生成卡片草稿 → `vocab.resolveCard`；
2. 若判定同类 → 用户选择放弃 / 替换 / 仍新增；
3. `dialog.captureWord`（写）：写 `dialog__capture` 行 + `ctx.call("vocab.addCard" / "vocab.updateCard")`——一次事务两处落账；`context` 带消息原句，`source: "dialog"`。

### 6.3 其他

- 助手回复重新生成：创建助手消息的兄弟节点并切换选中（树形模型已具备）；
- 流式输出：需扩展 `platform.ai.chat` 的传输（SSE + IPC 转发）与界面；
- 将来的 builder 可能复用聊天界面 / 消息模型（届时评估，不预先抽象）。
