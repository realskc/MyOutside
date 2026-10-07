# 子应用规格：对话应用（dialog）

> 状态：v1 规格草案（2026-10-07）。应用 id：`dialog`；显示名「对话」。
> 第二个子应用。v1 = 纯聊天；抓词耦合（跨应用旗舰示例）为下一步，设计见 §8。

## 1. 定位

- **后台服务**：会话与消息的私有数据；对外提供 API（生成回复的编排也在后端）。
- **前台界面**：多会话聊天（简易 ChatGPT）——新建会话、消息历史、Markdown 渲染、失败重试。
- 角色：验证「第二个子应用的接入」与「平台 AI 的第二种用法」；抓词耦合放到下一步。

## 2. 已定决策

| 决策 | 选择 |
|---|---|
| v1 范围 | 纯聊天：多会话 + 历史 + Markdown + 失败重试 |
| 回复生成位置 | dialog 后端 read 函数编排（历史截断 + system prompt + `platform.ai.chat`）；UI 不直接调 AI |
| 流式输出 | 不做（平台 AI 整段返回；流式需内核 / 传输层改造，后置） |
| 系统提示词 | **每会话可自定义**；`null` = 恢复默认（后端常量） |
| 标题 | 首条用户消息自动截断生成；支持手动重命名 |
| 上下文管理 | 按字符预算截断最近消息（见 §5） |
| Markdown | 前端极简渲染（零依赖、转义优先）；代码块带复制按钮；无语法高亮 |
| usage | `platform.ai.chat` 透传 token usage；助手消息落库保存（为配额 / 成本留数据） |
| 刷新模型 | 面板装载时拉取；单活动面板，无推送 |

## 3. 数据模型（v1）

```
dialog.conversation
  id            TEXT PK
  title         TEXT NOT NULL DEFAULT ''   -- 空 = 界面显示「新对话」，首条用户消息自动生成
  system_prompt TEXT NULL                  -- null = 默认提示词（后端常量）
  created_at    INTEGER NOT NULL
  updated_at    INTEGER NOT NULL           -- 最近活动时间；会话列表倒序

dialog.message
  id            TEXT PK
  conversation_id TEXT NOT NULL
  role          TEXT NOT NULL              -- 'user' | 'assistant'
  content       TEXT NOT NULL
  model         TEXT NULL                  -- 助手消息的模型名
  usage         TEXT NULL                  -- JSON 文本：{ promptTokens, completionTokens, totalTokens }
  created_at    INTEGER NOT NULL
```

- 索引：`conversation(updated_at)`、`message(conversation_id, created_at)`。
- 删除会话 = 同一事务内删除其全部消息 + 会话。
- 消息不可编辑 / 删除（v1）；修改 system prompt 不回溯已生成的消息。

## 4. API（v1）

```ts
// —— 读（kind: "read"）——
dialog.listConversations({}) → Conversation[]        // updated_at 倒序；含 system_prompt
dialog.getMessages({ conversationId, limit?, before? }) → { messages: Message[], hasMore: boolean }
  // 默认取最新 N 条（升序返回）；before 为游标（created_at），供「加载更早」向上翻页
dialog.generateReply({ conversationId }) → { content, model, usage }   // 异步；不落库

// —— 写（kind: "tx"）——
dialog.createConversation({ title?, systemPrompt? }) → { conversationId }
dialog.appendMessage({ conversationId, role, content, model?, usage? }) → { messageId }
dialog.renameConversation({ conversationId, title }) → { ok }
dialog.setSystemPrompt({ conversationId, systemPrompt: string | null }) → { ok }
dialog.deleteConversation({ conversationId }) → { ok }
```

说明：

- 与 vocab 的「AI 辅助写」同构：**解析（异步、不落库）→ 提交（事务）** 两步；`generateReply` 失败不留半截状态。
- `appendMessage` 的附带行为：更新会话 `updated_at`；若 `title` 为空且 `role='user'`，用内容截断（约 24 字符）生成标题。
- `generateReply` 不传 tools；模型用平台全局设置（`ai.deepseek.model`）；无 key → `PRECONDITION` 错误（UI 提示去设置）。
- v1 无跨应用调用面（抓词耦合见 §8）；API 面保持最小。

## 5. 生成流程（`dialog.generateReply`）

1. 取会话（不存在 → `NOT_FOUND`）；`systemPrompt = conversation.system_prompt ?? DEFAULT_SYSTEM_PROMPT`；
2. 取最近 200 条消息 → 从最近往更早累加到**字符预算上限（暂定 20,000 字符）**，至少包含最近一条用户消息 → 恢复正序；
3. 组装 `messages = [{ role: "system", content: systemPrompt }, ...history]`；
4. `ctx.call("platform.ai.chat", { messages })` → 返回 `{ content, model, usage }`；
5. **不落库**——UI 拿到结果后另调 `appendMessage` 保存助手消息。

`DEFAULT_SYSTEM_PROMPT`（暂定稿）：「你是一个乐于助人的 AI 助手。回答简洁、准确；除非用户要求，使用与用户相同的语言回答。」

## 6. 前台界面（v1）

- **布局**：左栏会话列表（新建 / 重命名 / 删除 / 当前会话设置），右栏消息流 + 输入区；窄屏（< 720px）列表收为抽屉。
- **发送编排**：`appendMessage(user)` → 等待状态 → `generateReply` → `appendMessage(assistant)`；失败显示错误气泡 +「重试」，用户消息保留。
- **生成中**：禁用发送；允许切换会话（生成按会话在后台完成，回到会话时重新拉取）。
- **输入**：`Enter` 发送 / `Shift+Enter` 换行；处理中文输入法 composition，避免误发。
- **消息**：Markdown 渲染 + 复制按钮；代码块等宽 + 复制按钮。
- **会话设置**：编辑 system prompt（保存 / 恢复默认）。
- **文案**：中英双语（沿用 vocab 的 DICT 模式）；默认 system prompt 为中文。

## 7. 非目标（v1 不做）

- 抓词进词库（下一步，见 §8）、流式、重新生成、消息编辑 / 删除、会话搜索、附件 / 图片 / 语音、多模型选择、token 用量展示。

## 8. 与未来的连接点

- **抓词耦合（下一步）**——protocol §3 旗舰示例的真实版：
  1. 选中消息中的词 → `dialog.prepareCapture`（read）：AI 生成卡片草稿（中文内容）→ `vocab.resolveCard`；
  2. 若判定同类 → 用户选「放弃 / 替换 / 仍新增」；
  3. `dialog.captureWord`（tx）：写 `dialog.capture` 行 + `ctx.call("vocab.addCard" / "vocab.updateCard")`——**一次事务两处落账**；`context` 带消息原句、`source: "dialog"`。
- builder（agent 形态）可能复用聊天界面 / 消息模型（届时评估抽取，不预先抽象）。
- 流式：如做，需扩展 `platform.ai.chat` 的传输（SSE + IPC 转发），本应用 UI 相应改造。

## 9. 待确认（小项）

1. 默认 system prompt 文案（§5 暂定稿）。
2. 消息里的链接：建议加宿主小扩展 `host.openExternal`（点击用系统浏览器打开，约 10 行）；否则渲染为纯文本。
3. 上下文预算 20,000 字符、标题截断 24 字符——先按此实现，可随时调。

## 10. 工程落点（实现参考）

- `packages/contracts/src/dialog.ts`（zod + `DialogApi`，加入 `ApiMap`）；`platform.ts` 增加 `usage` 字段；
- `apps/dialog/backend/src/index.ts`（`AppModule`：迁移 + API）、`apps/dialog/ui/`（静态 UI，零构建）；
- `apps/host/src/main/index.ts`：`registerApp(dialogApp)` + `uiDirs.dialog`；`apps/host/package.json` 加依赖；
- 测试（`apps/dialog/test/`）：会话 / 消息 CRUD、自动标题、预算截断、无 key → `PRECONDITION`、stub `fetch` 的成功路径；
- 冒烟：面板加载 + 会话列表渲染 + 截图；README 与本文按惯例随功能提交同步。
