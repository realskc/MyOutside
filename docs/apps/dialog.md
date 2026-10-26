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
  usage            TEXT NULL                     -- JSON：{ promptTokens, completionTokens, totalTokens, reasoningTokens? }
  active_child_id  TEXT NULL                     -- 当前选中的子消息
  created_at       INTEGER NOT NULL              -- 会话内单调递增（同毫秒写入时 +1）
```

索引：`message(conversation_id, parent_id)`、`message(conversation_id, created_at)`、`conversation(updated_at)`。

**当前路径**：从 `active_first_id` 起，沿各消息的 `active_child_id` 下降；指针缺失或失效时兜底取最新的子消息。界面渲染与发给 AI 的上下文都取当前路径。

删除只有 `deleteConversation`（同一事务删全部消息与会话）。

## 3. API

```ts
// —— 读 ——
dialog.listConversations({}) → Conversation[]            // updated_at 倒序
dialog.getPath({ conversationId, limit? }) → { messages: PathMessage[], hasMore }
  // 当前路径最近 N 条（默认 100，升序）；PathMessage = Message + { siblingCount, siblingIndex, siblingIds }
dialog.getUsage({ conversationId }) → { replies, promptTokens, completionTokens, totalTokens, reasoningTokens }
  // 汇总所有分叉中带 usage 的消息
dialog.generateReply({ conversationId }) → { content, reasoning, model, usage }   // 异步；不落库

// —— 写 ——
dialog.createConversation({ title?, systemPrompt?, reasoningEffort? }) → { conversationId }
dialog.appendMessage({ conversationId, role, content, model?, reasoning?, usage? }) → { messageId }
dialog.editUserMessage({ messageId, content }) → { messageId }
dialog.switchBranch({ conversationId, parentId: string | null, childId }) → { ok }
dialog.renameConversation({ conversationId, title }) → { ok }
dialog.setSystemPrompt({ conversationId, systemPrompt: string | null }) → { ok }
dialog.setReasoningEffort({ conversationId, effort }) → { ok }
dialog.deleteConversation({ conversationId }) → { ok }
```

- `appendMessage`：接到当前路径末端；更新分叉指针与 `updated_at`；标题为空且 role=user 时自动生成标题（约 24 字符）；校验问答交替：user 不能接在 user 后面，assistant 必须接在 user 后面；
- `editUserMessage`：仅 role=user（D-0031）；在原位置（同一父消息下）新建消息并切换选中指针；
- `generateReply`：要求当前路径末端是用户消息；无密钥 → `PRECONDITION`。

## 4. 生成流程（D-0030、D-0033）

1. 取会话；`systemPrompt = system_prompt ?? DEFAULT_SYSTEM_PROMPT`；
2. 计算当前路径；
3. 从末端往前累加历史，直到估算 token 接近 1,000,000；至少保留最近一条用户消息；截断后若首条为 assistant 则继续前移；估算：中日韩字符 ≈ 1 token，其余 ≈ 4 字符 / token；
4. `messages = [system, ...history]`，历史只含 user / assistant 的 `content`，**不含 reasoning**（D-0032）；
5. `ctx.call("platform.ai.chat", { messages, reasoningEffort })`；思考模式下 temperature 不生效，因此不传；
6. 返回结果，不落库；界面另调 `appendMessage` 保存。

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

### 6.1 搜索（下一步）

- DeepSeek Search / Fetch API（`POST /v1/tools/search`、`POST /v1/tools/fetch`，与对话共用密钥；按次计费）；
- 不是模型内置能力：需要把 search / fetch 定义为工具，由 agent 循环执行并回填结果；
- 依赖：共享的 agent 框架（`user-spec/platform.md`「平台 AI」）、`platform.ai.chat` 支持回传 `reasoning_content`（`docs/architecture.md` §6.1）、消息模型扩展（工具调用与结果的存储）、进度显示（D-0009）。

### 6.2 抓词（暂不做）

1. 选中消息中的词 → `dialog.prepareCapture`（读）：AI 生成卡片草稿 → `vocab.resolveCard`；
2. 若判定同类 → 用户选择放弃 / 替换 / 仍新增；
3. `dialog.captureWord`（写）：写 `dialog__capture` 行 + `ctx.call("vocab.addCard" / "vocab.updateCard")`——一次事务两处落账；`context` 带消息原句，`source: "dialog"`。

### 6.3 其他

- 助手回复重新生成：创建助手消息的兄弟节点并切换选中（树形模型已具备）；
- 流式输出：需扩展 `platform.ai.chat` 的传输（SSE + IPC 转发）与界面；
- 将来的 builder 可能复用聊天界面 / 消息模型（届时评估，不预先抽象）。
