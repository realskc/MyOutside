# 子应用规格：对话应用（dialog）

> 状态：v1 已实现（2026-10-07；树形历史 / 分叉 / 思考强度）。应用 id：`dialog`；显示名「对话」。
> 第二个子应用。v1 = 纯聊天 + 树形分叉历史；抓词耦合（跨应用旗舰示例）为下一步，设计见 §8。

## 1. 定位

- **后台服务**：会话与消息的私有数据；对外提供 API（生成回复的编排也在后端）。
- **前台界面**：多会话聊天（简易 ChatGPT）——新建会话、树形历史、分叉切换、思考强度、Markdown 渲染、失败重试。
- 角色：验证「第二个子应用的接入」与「平台 AI 的第二种用法」；抓词耦合放到下一步。

## 2. 已定决策

| 决策 | 选择 |
|---|---|
| v1 范围 | 纯聊天：多会话 + 树形历史 + 分叉切换 + Markdown + 失败重试 |
| 历史保存 | **全部消息永久保留**（含所有分叉）；不自动清理；仅「发送给 AI 的上下文」按预算截断 |
| 对话结构 | **树形**：消息携带父指针；编辑中间的用户消息 = 新建分叉；在有兄弟的节点处切换分叉 |
| 编辑范围 | **仅用户消息**可编辑（新分叉 + 自动重新生成）；助手消息不支持编辑 |
| 回复生成位置 | dialog 后端 read 函数编排（路径截断 + system prompt + `platform.ai.chat`）；UI 不直接调 AI |
| 流式输出 | 不做（平台 AI 整段返回；流式需内核 / 传输层改造，后置） |
| 思考强度 | 每会话档位：**关 / 低 / 高 / 最高**（`reasoning_effort`：none / low / high / max）；**默认「高」**；随时可改，对之后的新回复生效 |
| 思考过程 | **折叠展示 + 落库**（assistant 消息存 `reasoning`）；不进入后续对话上下文 |
| 系统提示词 | 每会话可自定义；`null` = 恢复默认（后端常量） |
| 上下文预算 | **1,000,000 tokens**（估算口径见 §5；存储不受限，仅请求截断） |
| 标题 | 首条用户消息自动截断（约 24 字符）；支持手动重命名 |
| 链接 | AI 回复中的链接渲染为**可点击**（仅 http/https），点击经宿主 `host.openExternal` 用系统浏览器打开 |
| 模型 | 平台默认 `deepseek-flash`（平台设置可覆盖） |
| Markdown | 前端极简渲染（零依赖、转义优先）；代码块带复制按钮；无语法高亮 |
| usage | `platform.ai.chat` 透传 token usage（含 reasoning tokens）；助手消息落库保存；**输入区显示会话累计**、每条回复显示本条明细 |
| 刷新模型 | 面板装载时拉取；单活动面板，无推送 |

## 3. 数据模型（v1）

```
dialog.conversation
  id               TEXT PK
  title            TEXT NOT NULL DEFAULT ''   -- 空 = 界面显示「新对话」，首条用户消息自动生成
  system_prompt    TEXT NULL                  -- null = 默认提示词（后端常量）
  reasoning_effort TEXT NOT NULL DEFAULT 'high'  -- 'none' | 'low' | 'high' | 'max'
  active_first_id  TEXT NULL                  -- 当前选中的根消息（根消息被编辑分叉后用于切换）
  created_at       INTEGER NOT NULL
  updated_at       INTEGER NOT NULL           -- 最近活动时间；会话列表倒序

dialog.message
  id               TEXT PK
  conversation_id  TEXT NOT NULL
  parent_id        TEXT NULL                  -- 父消息；null = 会话根消息
  role             TEXT NOT NULL              -- 'user' | 'assistant'
  content          TEXT NOT NULL
  reasoning        TEXT NULL                  -- 思考过程（仅思考模式下的 assistant 消息）
  model            TEXT NULL                  -- 助手消息的模型名
  usage            TEXT NULL                  -- JSON：{ promptTokens, completionTokens, totalTokens, reasoningTokens }
  active_child_id  TEXT NULL                  -- 当前选中的子消息（分叉指针；新建 / 切换时更新）
  created_at       INTEGER NOT NULL
```

- **树形结构**：`parent_id` 构成消息树；`conversation.active_first_id` + 各消息的 `active_child_id` 构成**当前路径**（从根沿选中子节点下降）。界面渲染与发送给 AI 的上下文都取当前路径。
- 分叉指针只是「当前选中」记忆：旧分支数据不丢，切回时原样恢复（含各节点此前的选择）。
- 索引：`message(conversation_id, parent_id)`、`message(conversation_id, created_at)`、`conversation(updated_at)`。
- 删除会话 = 同一事务内删除其全部消息 + 会话（唯一删除入口；消息级不设删除）。
- 修改 system prompt / 思考强度不回溯已生成的消息。

## 4. API（v1）

```ts
// —— 读（kind: "read"）——
dialog.listConversations({}) → Conversation[]            // updated_at 倒序；含 system_prompt / reasoning_effort
dialog.getPath({ conversationId, limit? }) → { messages: PathMessage[], hasMore: boolean }
  // 当前路径的最近 N 条（升序返回）。PathMessage = Message + { siblingCount, siblingIndex, siblingIds }
  // siblingIds 按创建时间升序（含自己），供 ‹i/k› 切换器定位目标分叉；「加载更早」= 增大 limit
dialog.getUsage({ conversationId }) → { replies, promptTokens, completionTokens, totalTokens, reasoningTokens }
  // 会话累计 token（汇总所有分叉；忽略无 usage 的消息）
dialog.generateReply({ conversationId }) → { content, reasoning, model, usage }   // 异步；不落库

// —— 写（kind: "tx"）——
dialog.createConversation({ title?, systemPrompt?, reasoningEffort? }) → { conversationId }
dialog.appendMessage({ conversationId, role, content, model?, reasoning?, usage? }) → { messageId }
  // 接到当前路径末端；更新 updated_at；title 为空且 role=user 时自动生成标题；
  // 更新分叉指针（父.active_child = 新消息 / 根级 active_first）
dialog.editUserMessage({ messageId, content }) → { messageId }
  // 仅 role=user；在原位置创建新分叉（parent 同原消息），并把选中指针切到新消息
dialog.switchBranch({ conversationId, parentId: string | null, childId: string }) → { ok }
  // 切换某节点下的选中子消息（parentId=null 切根消息）；当前路径随之改变
dialog.renameConversation({ conversationId, title }) → { ok }
dialog.setSystemPrompt({ conversationId, systemPrompt: string | null }) → { ok }
dialog.setReasoningEffort({ conversationId, effort: "none" | "low" | "high" | "max" }) → { ok }
dialog.deleteConversation({ conversationId }) → { ok }
```

说明：

- 与 vocab 的「AI 辅助写」同构：**解析（异步、不落库）→ 提交（事务）** 两步；`generateReply` 失败不留半截状态。
- 编辑分叉的完整流程（UI）：`editUserMessage`（新分叉 + 选中）→ `generateReply`（沿新路径生成）→ `appendMessage`（助手回复落在新分叉下）。旧分叉与其回复原样保留。
- 校验：`generateReply` 要求当前路径末端是用户消息；`appendMessage(role=user)` 要求末端不是用户消息（保证问答交替）。
- `generateReply` 不传 tools；模型用平台全局设置（默认 `deepseek-flash`）；无 key → `PRECONDITION`（UI 提示去设置）。
- v1 无跨应用调用面（抓词耦合见 §8）。

## 5. 生成流程（`dialog.generateReply`）

1. 取会话（不存在 → `NOT_FOUND`）；`systemPrompt = conversation.system_prompt ?? DEFAULT_SYSTEM_PROMPT`；`reasoningEffort = conversation.reasoning_effort`；
2. **计算当前路径**：取该会话全部消息 → 建 `id → row` 映射 → 从 `active_first_id` 起沿 `active_child_id` 下降（指针缺失时兜底取最新子消息）→ 得到根到末端的消息序列；
3. 从末端向更早累加历史，直到**估算 token 数**接近预算上限 **1,000,000 tokens**；至少保留最近一条用户消息；截断后若首条为 assistant 则继续前移，保证序列从 user 开始；
4. 组装 `messages = [{ role: "system", content: systemPrompt }, ...history]`（历史只含 user / assistant 的 `content`，**不含 reasoning**）；
5. `ctx.call("platform.ai.chat", { messages, reasoningEffort })` → 返回 `{ content, reasoning, model, usage }`；
6. **不落库**——UI 拿到结果后另调 `appendMessage` 保存助手消息（content / reasoning / usage）。

- 估算口径（v1）：CJK 字符 ≈ 1 token，其余字符 ≈ 4 字符 / token（`estTokens = cjk + ceil(other / 4)`）；将来可替换为真正的 tokenizer。
- 截断只影响**发送给 AI 的上下文**，不影响存储与界面展示（历史全量保留）。
- 思考模式下 `temperature` 不生效（DeepSeek 规则），因此不传 temperature。
- 模型实际上下文上限由 DeepSeek 决定；超出时按 `UPSTREAM` 错误展示（平台将来可在代理层做模型限额自动适配）。

`DEFAULT_SYSTEM_PROMPT`（暂定稿）：「你是一个乐于助人的 AI 助手。回答简洁、准确；除非用户要求，使用与用户相同的语言回答。」

## 6. 前台界面（v1）

- **布局**：左栏会话列表（新建 / 重命名 / 删除 / 当前会话设置），右栏消息流 + 输入区；窄屏（< 720px）列表收为抽屉。
- **消息流（当前路径）**：只显示当前路径；某条消息的兄弟数 > 1 时，在该处显示 `‹ i/k ›` 分叉切换器（根消息与各层用户消息都可能出现），点击即切到相邻分叉（下方整条路径随之切换）。
- **编辑用户消息**：用户消息悬停出现「编辑」→ 行内编辑 → 保存 = 新分叉 + 自动重新生成回复；旧分叉保留，可用切换器切回。
- **思考强度**：输入区工具条上的档位选择（关 / 低 / 高 / 最高），改动即存（`dialog.setReasoningEffort`），对之后的新回复生效；会话设置里同样可见。
- **思考过程**：助手消息如有 `reasoning`，在回复上方显示折叠块「思考过程」，点击展开。
- **用量显示**：输入区右侧显示本会话累计 tokens（悬停查看 输入 / 输出 / 思考 / 合计）；每条 assistant 消息的操作栏显示本条明细（悬停消息可见）。
- **发送编排**：`appendMessage(user)` → 等待状态 → `generateReply` → `appendMessage(assistant)`；失败显示错误气泡 +「重试」，用户消息保留。
- **生成中**：该会话的发送 / 编辑 / 切换分叉暂时禁用；可以切到其他会话（生成按会话在后台完成，回到会话时重新拉取）。
- **输入**：`Enter` 发送 / `Shift+Enter` 换行；处理中文输入法 composition，避免误发。
- **消息**：Markdown 渲染 + 复制按钮；代码块等宽 + 复制按钮；链接可点击（系统浏览器打开）。
- **会话设置**：编辑 system prompt（保存 / 恢复默认）。
- **文案**：中英双语（沿用 vocab 的 DICT 模式）；默认 system prompt 为中文。

## 7. 非目标（v1 不做）

- 抓词进词库（下一步，见 §8）、流式、助手回复重新生成（机制已备，后置）、消息删除、会话搜索、附件 / 图片 / 语音、多模型选择。

## 8. 与未来的连接点

- **抓词耦合（下一步）**——protocol §3 旗舰示例的真实版：
  1. 选中消息中的词 → `dialog.prepareCapture`（read）：AI 生成卡片草稿（中文内容）→ `vocab.resolveCard`；
  2. 若判定同类 → 用户选「放弃 / 替换 / 仍新增」；
  3. `dialog.captureWord`（tx）：写 `dialog.capture` 行 + `ctx.call("vocab.addCard" / "vocab.updateCard")`——**一次事务两处落账**；`context` 带消息原句、`source: "dialog"`。
- **助手回复重新生成**：复用编辑分叉机制——创建 assistant 兄弟节点并切换选中（树形模型已具备，随时可补）。
- builder（agent 形态）可能复用聊天界面 / 消息模型（届时评估抽取，不预先抽象）。
- 流式：如做，需扩展 `platform.ai.chat` 的传输（SSE + IPC 转发），本应用 UI 相应改造。

## 9. 工程落点（实现参考）

- `packages/contracts/src/dialog.ts`（zod + `DialogApi`，加入 `ApiMap`）；`platform.ts`：`AiChatInput` 增加 `reasoningEffort`，`AiChatOutput` 增加 `reasoning` 与 `usage`；
- `packages/kernel/src/platform-ai.ts`：默认模型改 `deepseek-flash`；透传 `reasoning_effort`；解析 `reasoning_content` 与 `usage`；
- `apps/dialog/backend/src/index.ts`（`AppModule`：迁移 + API + 路径计算 / 预算截断助手）、`apps/dialog/ui/`（静态 UI，零构建）；
- `apps/host/src/main/index.ts`：`registerApp(dialogApp)` + `uiDirs.dialog` + `host.openExternal`（仅 http/https；preload 暴露 `outside.openExternal`）；`apps/host/package.json` 加依赖；
- 测试（`apps/dialog/test/`）：会话 / 消息 CRUD、路径计算（含分叉）、编辑产生分叉 + 切换、思考档位透传（stub `fetch` 断言请求体）、reasoning / usage 落库、自动标题、预算截断（小预算模拟）、无 key → `PRECONDITION`；
- 验证：`ai:ping` 用真实调用确认 `deepseek-flash` 与 `reasoning_effort` 参数（已通过）；冒烟：**临时数据副本 + 演示写入**（会话 → 消息 → 编辑生成分叉 → 展开思考过程）+ 截图（不污染真实数据）；
- README 与本文按惯例随功能提交同步。
