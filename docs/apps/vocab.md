# 学英语（vocab）技术文档

> 应用 id：`vocab`；显示名「学英语」。用户的预期见 `user-spec/apps/vocab.md`。

## 1. 结构

- 后台：`apps/vocab/backend/src/`（`index.ts` = AppModule；`mapping.ts` = 行 ↔ 卡片 / FSRS 转换；`data/toefl-word-levels.json` = 参考词表）
- 界面：`apps/vocab/ui/`（静态 HTML / JS，五个标签页：复习 / 查词 / 词库 / 添加 / 统计）
- 契约：`packages/contracts/src/vocab.ts`
- 测试：`apps/vocab/test/vocab.test.ts`

## 2. 数据模型

### `vocab__card`（D-0021）

```
id              TEXT PK
term            TEXT NOT NULL      -- 归一化拼写（trim + 小写 + 折叠空格），只用于机械查重
display         TEXT NOT NULL      -- 原始写法
sense           TEXT NOT NULL      -- 本质意项
phonetic        TEXT               -- 音标（IPA）
meaning         TEXT NOT NULL DEFAULT ''
context         TEXT               -- 例句 / 语境
source          TEXT               -- 来源（默认 'manual'；将来抓词为 'dialog'）
status          TEXT NOT NULL DEFAULT 'learning'   -- 'learning' | 'mastered'（D-0023）
due, stability, difficulty, elapsed_days, scheduled_days,
learning_steps, reps, lapses, state, last_review   -- ts-fsrs Card 字段（D-0026）
created_at      INTEGER NOT NULL
```

索引：`term`、`due`、`status`。

### `vocab__word_level`（D-0025）

```
term   TEXT PK    -- 归一化拼写
level  TEXT       -- 'A' | 'B' | 'C' | 'D'
```

参考数据（不是用户数据），迁移 `0002_word_level` 一次性种入。数据文件由 `pnpm build:toefl [源文件]`（`scripts/build-toefl-levels.ts`）生成并**随仓库提交**（见 D-0057）：输出 `[term, level]` 数组；同一词跨分类 / 级别时取最高优先级 A > B > C > D。

### 迁移

- `0001_init`：建 `card` 表与索引；
- `0002_word_level`：建 `word_level` 表并种入参考词表。

## 3. API

```ts
// —— 读 ——
vocab.getDue({ before?, limit? }) → Card[]            // status=learning 且 due <= before（默认现在），按 due 升序，默认 50
vocab.listCards({ term?, query?, status?, limit?, offset? }) → Card[]
  // term：按归一化拼写精确匹配；query：按 display 模糊匹配；按 created_at 倒序，默认 200
vocab.getStats({}) → { cards, learning, mastered, dueNow }
vocab.previewReview({ cardId }) → { again, hard, good, easy: { due, scheduledDays } }
vocab.resolveCard({ term, sense, meaning?, context? }) → { action: "new" } | { action: "match", cardId }

// —— 写 ——
vocab.addCard({ term, display?, sense, meaning?, phonetic?, context?, source?, scheduling? }) → { cardId }
vocab.updateCard({ cardId, patch: { sense?, meaning?, phonetic?, context? } }) → { ok }
vocab.submitReview({ cardId, rating: "again" | "hard" | "good" | "easy" }) → { state, due, scheduledDays }
vocab.setMastered({ cardId, mastered }) → { ok }
```

- `getDue` / `listCards` 返回的 Card 带 `level`（命中参考词表时为 A–D，否则 `null`）；
- `addCard` 只负责新建，不查重；`scheduling` 用于导入 / 恢复调度状态，普通添加不传；
- `previewReview` 只读；ts-fsrs fuzz 关闭，预览与实际结果一致。

## 4. 添加流程（D-0022、D-0008）

1. `vocab.resolveCard`：按 `term` 查已有卡片；没有 → `new`；有 → 调用 `platform.ai.chat`，提供已有卡片的「单词 + 意项 + 释义」列表，强制调用 `submit_decision` 工具返回 `matchIndex`（temperature 0）；解析失败视为无同类；
2. 界面根据结果：
   - `new` → `vocab.addCard`；
   - `match` → 展示已有卡片，用户选择：替换（`vocab.updateCard`，保留调度）/ 仍新增（`vocab.addCard`）/ 放弃；
3. 未配置 AI 密钥或调用失败时，界面回退为只做机械检查。

## 5. 查词（D-0027、D-0024）

- 界面直接调用 `platform.ai.chat`，带 `make_card` 工具；AI 返回卡片草稿（单词 / 意项 / 音标 / 释义 / 例句），内容一律中文、例句英文；
- 用户确认「加入词库」后走添加流程；结果不缓存。

## 6. 界面

- **复习**（D-0028）：剩余张数 → 单词 → 显示答案（音标 / 释义 / 语境 / 分级徽章）→ 评分（重来 / 不错 / 简单，按钮下显示 `previewReview` 的间隔）或「完全学会」（`setMastered`）；
- **词库**：卡片列表 + 拼写搜索 + 展开编辑 + 标记 / 取消掌握；命中参考词表显示「托福 A/B/C/D」徽章；
- **添加**：手动填写单词 / 意项 / 释义 / 音标 / 语境，走添加流程；
- **统计**：卡片总数 / 学习中 / 已掌握 / 待复习；
- 文案中英双语（D-0015）。

## 7. 脚本

- `pnpm import:vocabry`（`scripts/import-vocabry.ts`）：从旧 Vocabry 库 + Anki 迁移卡片，近似迁移复习状态，可重复运行；
- `pnpm build:toefl`：生成参考词表（§2）；
- `pnpm simulate`（`scripts/simulate-dialog.ts`）：模拟「对话应用经内核调用 vocab」的跨应用路径，使用仓库内 `data/` 目录。

## 8. 待定

- 两步添加是否合并为一步（需要「异步写」类别的函数，见 `docs/architecture.md` §11）；
- 词形归并（running → run）；按释义搜索；复习日志（revlog）落库。
