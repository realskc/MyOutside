# 子应用规格：学英语应用（vocab）

> 状态：v1 规格草案（2026-10-01）。应用 id 暂用 `vocab`（占位，待正式命名）。
> 本应用是第一个子应用，用于验证「后台服务 + 前台界面」形态与单应用协议。

## 1. 定位

- **后台服务**：维护「我的英语状态」——已掌握的卡片、正在背的卡片（含复习调度）。
- **前台界面**：按需求增长的**功能集合**。当前两个：
  - **背单词**：卡片复习（见 §6.1）；
  - **查词**：调用 DeepSeek 做翻译与解说，并可生成卡片草稿供用户加入词库（见 §6.2）。
- 后续方向（示例）：口语练习、英语阅读等。

## 2. 两层形态

- **后台服务**：拥有私有数据，对外提供 API；**无界面也可被调用**（为将来「对话应用加词」准备）。**安装即常驻**。
- **前台界面**：Web UI；**只通过自己的后台 API（与平台服务）访问数据**。
- 实现形态（按协议）：`backend` = 宿主内的 Node 模块；`ui` = Web 入口。

## 3. 已定的设计决策

| 决策 | 选择 |
|---|---|
| 卡片粒度 | 每张卡片 = **单词 + 本质意项**；**没有独立的"单词"层级**——同一拼写的不同释义就是不同卡片（date=椰枣 与 date 的"时间 / 约会"义各成卡片） |
| 添加去重 | `term` 机械检查：不存在 → 直接建；已存在 → **把该拼写已有卡片的「单词 + 释义」交给 LLM 判断**是否同类；判定同类时**不自动合并**——告知用户，由用户决定**放弃或替换**（替换 = 覆盖展示字段，保留复习调度） |
| 音标 | 卡片包含**音标字段**（IPA），**由 AI 产出**（当前唯一产出渠道是 AI 翻译模式），可手工修正；按卡片记（read、lead 这类同词不同音由卡片承载） |
| 调度算法 | **ts-fsrs**（现成 TS 库，FSRS 现代算法） |
| 掌握状态 | **全手动**：复习间隔持续增长，但状态只由用户显式标记（2026-10-01 修订）；按卡片记 |
| 语境字段 | v1 就包含 `context` / `source`（为跨应用耦合准备） |
| 生命周期 | 安装即常驻（v1 不引入启用 / 停用） |

## 4. 数据模型（v1）

```
vocab.card
  id
  term           -- 归一化（trim + lowercase + 折叠空格）后的拼写；机械存在性检查用
  display        -- 原始书写形式
  sense          -- 本质意项（人话描述；用于展示与 LLM 去重判断）
  phonetic       -- 音标（IPA；由 AI 产出，可手工修正）
  meaning        -- 释义 / 解说
  context?, source?
  status         -- 'learning' | 'mastered'
  -- ts-fsrs 调度字段（与库的 Card 对齐）
  due, stability, difficulty, elapsed_days, scheduled_days,
  reps, lapses, state, last_review
  created_at
```

- **没有"单词"层级**：统计与展示都按卡片（同一拼写的卡片只是恰好共享 `term`）。
- 复习日志（revlog）v1 不存（ts-fsrs 的 log 不落库）。
- 归一化规则（仅用于 `term` 的机械检查）：`trim + lowercase + 折叠空格`；词形归并（running→run）以后再说。

## 5. API（v1，名字待契约定稿）

```ts
// —— 读（kind: "read"）——
vocab.getDue({ before?, limit? }) → Card[]
vocab.listCards({ term?, query?, status?, limit?, offset? }) → Card[]
vocab.getStats() → { cards, learning, mastered, dueNow }

// —— 添加：两步（异步解析 → 事务提交）——
// 1) 解析：判断"新卡片"还是"与已有卡片同类"；term 已存在时使用平台 AI
vocab.resolveCard({ term, sense, meaning?, context? })
  → { action: "new" } | { action: "match", cardId: string }

// 2) 提交（kind: "tx"）
vocab.addCard({ term, sense, meaning?, phonetic?, context?, source? })
  → { cardId }

// —— 复习与状态（kind: "tx"）——
vocab.submitReview({ cardId, rating: "again" | "hard" | "good" | "easy" })
  → { state, due, scheduledDays }
vocab.setMastered({ cardId, mastered: boolean }) → { ok }
vocab.updateCard({ cardId, patch: { sense?, meaning?, phonetic?, context? } }) → { ok }
```

说明：

- **为什么添加要两步**：LLM 去重是异步网络操作，而事务函数必须同步纯数据——因此"解析"（异步，可调平台 AI）与"提交"（事务）分开。这个模式预计会反复出现：**AI 辅助的写操作 = 先解析、后提交**。
- resolve 的 LLM 输入：新词条 + 该拼写已有卡片的「单词 + 释义」列表（数量很少，直接全给）。
- `addCard` 只负责**创建新卡片**，本身不查重——查重由 `resolveCard` + 用户决定完成；跨应用调用方应遵循同样的两步流程。
- match 后**没有自动合并**：告知用户已有卡片，由用户选择**放弃**或**替换**；替换 = 用新内容覆盖该卡片（走 `updateCard`），保留复习调度。
- 掌握状态：**全手动**，按卡片记。

## 6. 前台界面（v1）

功能会随需求增长；v1 先做两个：

### 6.1 背单词

- **复习页**：显示单词 → 翻面显示音标 / 释义 / 语境 → 评分（重来 / 不错 / 简单；API 另有 hard 档）。
- **词库页**：卡片列表（同拼写卡片可分组展示）+ 搜索 + 编辑 + 手动标记掌握。
- **统计**：卡片数 / 学习中 / 已掌握 / 待复习（简版）。

### 6.2 查词（AI）

- 输入单词 → 调用平台 AI 服务（`platform.ai.chat`，DeepSeek）做翻译与解说；
- 请求中带一个「**生成卡片**」工具：AI 返回结构化卡片草稿（单词 / 本质意项 / 音标 / 释义 / 例句）；
- **用户确认后**：若 resolve 判定为新，则 `vocab.addCard`；若判定与已有卡片同类，则告知用户，由用户选择**放弃或替换**（替换覆盖该卡片、保留复习数据）；
- 查词结果**不缓存**（每次实时调用；省额度等优化暂不做）；
- 说明：AI 调用是异步网络操作，由**前台**发起、平台代理执行；后台服务保持纯数据、同步。

## 7. 非目标（v1 不做）

- 发音 / 音频、导入导出、复习历史、云同步、自定义 FSRS 参数。

> 注：像"批量导入 2000 个已掌握单词"这类一次性需求，不需要做成接口——按「临时函数」通道处理（见 requirements.md §2.6）。

## 8. 与未来的连接点

- 「对话应用」抓词将走同一套 `resolveCard → addCard` 流程（而不是一次性 `addWord`）；
- 查词生成的卡片与对话抓词，最终都汇入同一套卡片体系；
- 若将来引入「应用启停」，本应用需配合处理停用语义（当前：安装即常驻）。

## 9. 待定

- 两步添加将来是否合并为一步（需要新的函数类别：异步写）。
