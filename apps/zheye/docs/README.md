# 哲野（zheye）技术文档

> 应用 id：`zheye`；显示名「哲野」。目前只实现了**试验台**（§0）；§1 起是早期的技术设计草案，正式功能实现前重写。
> 作者的预期见 [`../user-spec/README.md`](../user-spec/README.md)，决策见 [`../user-spec/decisions/`](../user-spec/decisions/README.md)。早期决策 ZHEYE-0001～0008 不一定可靠。

## 0. 试验台（已实现，ZHEYE-0020、ZHEYE-0021）

作者设计、调试三类讲解的工作流与提示词用。哲野的界面目前就是试验台。

**配方**：`apps/zheye/recipes/`（写法见 `recipes/README.md`）。外壳注册哲野时把这个目录交给后端：`createZheyeApp({ recipesDir })`；每次试跑开始时从磁盘读，存下快照。

**流程**（`backend/src/trial.ts`）：按 `flow.json` 的步骤依次执行，每一步一次 `runToolLoop`（流式，思考强度 / 模型取自配方）：

- 系统提示词 = `system` 里的文件 + 这一步的 `prompt`（`renderPrompt`：去注释、展开 `{{引入 …}}`、替换变量）；
- 用户消息 = 讲解对象 + 当前全部草稿（`composeUserMessage`）；
- 工具 = `web_search` / `web_fetch`（平台工具）+ `read_doc` / `edit_doc` / `write_doc`（`backend/src/drafts.ts`，ZHEYE-0019；`repeatable`，草稿在内存里）；
- 每一轮结束（`onRound`）、每次草稿修改都经事务 API `zheye.trialAppend` 存一条轨迹并推送 `{ type: "trial_event" }`；结束时 `zheye.trialFinish`。

**API**

| 函数 | 类型 | 说明 |
|---|---|---|
| `zheye.getRecipe` | 只读 | 读取一类讲解的当前配方（流程 + 全部文件），出错时返回原因 |
| `zheye.trialStart` | 异步 | 开始一次试跑，跑完才返回；一开始推送 `{ type: "trial_created", runId }` |
| `zheye.trialStop` | 异步 | 停止进行中的试跑（不是发起它的页面也能停；要等这一次模型输出结束） |
| `zheye.trialList` / `zheye.trialGet` | 只读 | 试跑记录；一次试跑的详情（配方快照 + 轨迹，`afterSeq` 取增量） |
| `zheye.trialCreate` / `trialAppend` / `trialFinish` | 事务（内部） | 试跑过程中由后端调用 |

**数据**

```
zheye__trial_run    id, subject, type, flow, recipe_hash, recipe(JSON 快照), status, error,
                    docs(JSON), usage(JSON), cost_yuan, web_calls, started_at, finished_at
zheye__trial_event  run_id, seq, stage, kind(stage_start | round | doc | stage_end), data(JSON), at
```

状态 `running` 但不在这次运行的进程里 → 读出时显示 `interrupted`。

**界面**（`ui/`）：左边新试跑与试跑记录；「流程与提示词」页画出步骤与每一步渲染后的提示词、用到的文件（「在编辑器里打开」经 `outside.openAppFile`，D-0077）；试跑页是步骤条 + 轨迹（提示词、每一轮的思维链 / 工具调用，实时输出）+ 草稿面板（每份草稿的每一版：渲染 / 原文 / 与上一版对比）；可以把两次试跑的文章与配方差异并排对比。Markdown 渲染复制自对话，另外把 `[文字](#概念:名称)` 这类标记渲染成可点的标记（ZHEYE-0017，点了暂时只提示）。

**冒烟**：`pnpm smoke` 检查流程页、写一次演示试跑看试跑页；`MYOUTSIDE_SMOKE_ZHEYE_LIVE=1` 时再经界面真跑一次（真实调用 DeepSeek）。

## 1. 核心概念

- **源材料（source）**：用户投递的原始内容（v1 = 一段粘贴的文本，ZHEYE-0008）；
- **讲解单元（unit）**：应用的中心对象，「单元 → 文章」一对一；类型按作者重新讨论的讲解设计：概念 / 断言 / 实体（见 spec「讲解的对象与方法」；早期的「词 / 句 / 文」已废弃）；
- **前置（prerequisite）**：单元到前置要素的边（词 / 句文本 + 轻 / 重 + 用户的回答，ZHEYE-0002）；
- **文章（article）**：讲解成果，生成后固定（ZHEYE-0003）。

## 2. 数据模型（草案）

```
zheye__source
  id              TEXT PK
  title           TEXT NOT NULL DEFAULT ''
  text            TEXT NOT NULL             -- v1：粘贴的完整原文
  ref             TEXT NULL                 -- 来源备注（不做抓取）
  created_at      INTEGER NOT NULL

zheye__unit
  id              TEXT PK
  type            TEXT NOT NULL             -- 'concept' | 'statement' | 'doc'
  target          TEXT NOT NULL             -- 词 / 句原文；doc 单元为标题或指代
  source_id       TEXT NULL                 -- doc 单元必填；提取的词 / 句可记录
  origin          TEXT NOT NULL             -- 'user' | 'extracted' | 'prerequisite'
  status          TEXT NOT NULL             -- 见 §3
  error           TEXT NULL
  created_at      INTEGER NOT NULL
  updated_at      INTEGER NOT NULL

zheye__unit_prerequisite
  unit_id         TEXT NOT NULL             -- 被讲单元
  position        INTEGER NOT NULL          -- 展示顺序
  text            TEXT NOT NULL             -- 前置要素（词或句）
  weight          TEXT NOT NULL             -- 'light' | 'heavy'
  answer          TEXT NULL                 -- 'known' | 'unknown'；light 与未询问为 NULL
  prerequisite_id TEXT NULL                 -- 对应的展开单元（复用或递归创建后回填）

zheye__article
  id              TEXT PK
  unit_id         TEXT NOT NULL             -- 1:1
  content_md      TEXT NOT NULL
  recipe_version  TEXT NOT NULL             -- 所用配方版本（ZHEYE-0007）
  model           TEXT NULL
  usage           TEXT NULL                 -- JSON
  created_at      INTEGER NOT NULL
```

阶段产物（精读笔记、前置提案原始输出等）建议落库用于调试与追溯（例如 `unit_artifact` 表，实现时定）。

## 3. 单元状态机

```
checking     初始检查中（精读 + 前置提案）
awaiting     已提案前置，等待回答
queued       依赖已理清，在生成队列中
generating   正在生成文章（全局同一时刻至多一个）
ready        文章已完成
failed       失败（可重试）
```

就绪条件：单元进入 `queued`，当且仅当其全部**重前置**要么已回答「了解」、要么对应文章已 `ready`。

## 4. API（草案）

沿用「先解析、后提交」（D-0008）：AI 解析是只读 API（异步、不落库），提交是事务 API。

```ts
// —— 读（AI）——
zheye.analyzeUnit({ unitId }) → { prerequisites: Array<{ text; weight: "light" | "heavy" }> }
zheye.proposeUnits({ sourceId }) → { candidates: Array<{ type; target; reason? }> }
zheye.generateArticle({ unitId }) → { contentMd; model; usage }      // 要求前置已就绪

// —— 读（查询）——
zheye.listSources({}) → Source[]
zheye.listUnits({}) → UnitSummary[]
zheye.getUnit({ unitId }) → { unit; prerequisites; article? }
zheye.getArticle({ unitId }) → Article
zheye.getQueue({}) → { generating: UnitRef | null; queued: UnitRef[] }

// —— 写 ——
zheye.addSource({ title?; text; ref? }) → { sourceId }
zheye.createUnit({ type; target; sourceId? }) → { unitId }          // 建后进入 checking
zheye.setPrerequisites({ unitId; prerequisites }) → { ok }
zheye.answerPrerequisites({ unitId; answers }) → { ok; createdUnits: UnitRef[] }
  // 落回答；对「不了解的重前置」在同一事务里创建子单元
zheye.saveArticle({ unitId; contentMd; recipeVersion; model?; usage? }) → { ok }
zheye.failUnit({ unitId; error }) → { ok }
zheye.retryUnit({ unitId }) → { ok }
zheye.deleteUnit({ unitId }) → { ok }
zheye.deleteSource({ sourceId }) → { ok }
```

- 递归展开由界面驱动工作列表：`analyzeUnit` → `setPrerequisites` → 用户回答 → `answerPrerequisites`（创建子单元）→ 对每个子单元重复，直到没有新的重前置；
- 生成队列同样由界面驱动（应用打开时逐篇跑）；关闭期间不生成，重开后按状态续跑；
- **注意**：这是最依赖「后端长流程」的应用。若共享的 agent 框架提供后端任务与中途写库能力（`docs/architecture.md` §11 第 6 条），编排应移到后端，不再由界面驱动。

## 5. 生成流程

```
添加源材料（可选：提取候选点 → 挑选）或直接提出词 / 句
        ↓
创建单元 → 精读 + 前置提案（checking）
        ↓
批量回答重前置（awaiting）
   ├─ 了解            → 文章一句带过
   ├─ 不了解 + 重      → 创建前置单元，递归走同样流程
   └─ 不了解 + 轻      → 正文就地补
        ↓
依赖就绪 → 自动排队（queued）
        ↓
串行生成：从最深的前置开始，一篇一篇（generating → ready）
```

- 讲解方法：见 spec「讲解的对象与方法」（重新讨论中；早期的模板 ZHEYE-0004 已废弃）；质量标准：ZHEYE-0013；联网搜集资料：ZHEYE-0014；
- 讲解风格、真实性约束：`apps/zheye/user-spec/README.md`。

## 6. 配方（ZHEYE-0007）

- 模板、质量标准、各阶段提示词放在人可读文件中（位置实现时定，如 `apps/zheye/pipeline/`）；
- 每篇文章记录配方版本（git 修订或显式版本号）；
- 试验台（ZHEYE-0020，取代早期的终端试验脚本）：哲野里的一个页面，显示流程与各环节提示词，保存并展示每次试跑的完整轨迹。

## 7. 界面（草案）

- **原料池**：添加 / 查看源材料；「提取候选点」并挑选建单元；也可直接输入词 / 句建单元；
- **学习列表（知识树）**：单元列表与状态，标注前置关系；点开进入阅读或前置问答；
- **阅读**：干净的 Markdown 排版；正文中的前置概念可点击跳到对应文章（已生成时）；
- **前置问答屏**：一屏列出该单元全部重前置，每个两个选项（了解 / 不了解）+ 可选备注；提交后若有新的前置展开，继续下一屏；
- **生成队列指示**：顶栏轻量显示「正在生成《X》· 队列剩余 n 篇」；
- 文案中文（暂定）。

## 8. 工程落点

- `packages/contracts/src/zheye.ts`：zod 类型 + API 签名，加入 `ApiMap`；
- `apps/zheye/backend/src/index.ts`（AppModule）、`apps/zheye/ui/`；
- `apps/host`：注册应用 + `uiDirs.zheye` + 依赖；
- 测试（`apps/zheye/test/`）：单元 / 前置 CRUD、回答后子单元创建、就绪条件与依赖顺序、串行队列与重开续跑、失败与重试、无密钥 → `PRECONDITION`；
- 平台 AI 已满足多轮调用、思考强度、usage 透传、工具循环的消息形状。

## 9. 技术上的待定

- 「同一个概念」的判断方式的细节（ZHEYE-0011、ZHEYE-0012 共用）；
- 删除的级联规则（v1 不做删除，ZHEYE-0008）；
- 编排挪到后端（普通的异步函数 + 启动时的后台工作，D-0063、D-0076）、单元与前置用任务图基类（D-0061）——实现时重写 §4。
