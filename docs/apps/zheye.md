# 子应用规格：哲野（zheye）

> 状态：设计草案（2026-10-07 讨论定稿；未实现）。应用 id：`zheye`；显示名「哲野」。
> 命名：取「之乎者也」与知乎相呼应；意取「哲理的海洋 / 知识的原野」。
> 第三个子应用。一句话：把「一个点」讲透的个人讲解系统——材料由你投递，内容为学会服务。

## 1. 定位

- **最高目的**：让使用者把「一个点」学进去——低认知压力 + 真正学到东西。判断标准不是精炼、不是长短，而是**把被讲的点讲好讲透**。
- **第二目的**：覆盖源材料（把投进来的原文讲完整）。与最高目的冲突时前者优先：宁可少讲几个点、每个点讲透，不做平均的逐节笔记。
- **对「愉悦」的定义**：学到真东西的愉悦（顿悟、理顺、看清结构），同时不累。明确**不**做：投其所好、性格 / 口味画像、强行加入笑话或个人关联。
- **角色（愿景）**：替代刷信息流（知乎、B 站）——放松的动机保留，但获得的始终是你想学的高质量内容。
- 讨论中明确否掉的机制：口味档案（难沉淀、偏离目标）；对原文的「高保真」约束（文章是精读成果，允许重构、综合、补背景；但必须真实——不编造、推测不当定论）。

## 2. 已定决策

| 决策 | 选择 |
|---|---|
| v1 范围 | 单用户；纯文本输入；三类讲解文章；前置检查（全递归）；串行自动生成；阅读界面 |
| 输入（v1） | 粘贴纯文本 / Markdown 文本；可选标题与来源备注（备注仅供人查阅，不做抓取）。采集做成适配器，arxiv / 网页 / PDF 后置 |
| 讲解单元 | 三种：**词**（concept：某个概念）/ **句**（statement：性质、结论、insight、现象、原型）/ **文**（doc：某篇源材料） |
| 单元来源 | 用户直接提出；从源材料提取候选点（用户挑选）；前置递归展开（自动创建） |
| 前置机制 | 精读后提出前置要素（词或句，尤其领域前置知识）；分**轻**（正文一两句就地解释）与**重**（需独立成文）；只对重前置批量询问「是否了解」（一次一屏） |
| 前置答案的作用 | 了解 → 正文一句带过；不了解的重前置 → 先生成独立文章；不了解的轻前置 → 正文就地补 |
| 递归 | **全递归**：重前置文章自身也走同样的「前置检查 → 生成」流程 |
| 生成 | 前置询问完成后**自动开始**；全局**串行，一次一篇**；按依赖顺序（前置先于被依赖者）；状态落库，应用重开续跑 |
| 文章 | 生成后保持固定（v1 不提供重新生成）；正文以消化的主线为主 |
| 深入区 | v1 不做独立组件；理解必需的推导 / 细节可内联（可折叠）；按需深入交给未来的批注 |
| 真实性 | 硬约束：不编造、推测不当定论；**不要求**对原文逐句忠实 |
| 读者模型 | 固定常量：聪明、有耐心、非该领域专家；讨厌绕、讨厌废话、不需要哄。不随时间学习变化 |
| 输出语言 | 中文（暂定；素材为外语时消化后以中文成文） |
| 反馈与画像 | 应用内不做反馈系统与任何画像；配方迭代在开发环（人 + Agent）中进行 |
| 配方 | 模板与 rubric（见 §5）以人可读文件随仓库版本化；每篇文章记录所用配方版本 |

## 3. 核心概念与数据模型（草案）

- **源材料（source）**：你投递的原始内容（v1 = 一段文本）。
- **讲解单元（unit）**：应用的中心对象，三种类型；「单元 → 文章」为 1:1。
- **前置（prerequisite）**：单元到前置要素的边（词 / 句文本 + 轻 / 重 + 你的回答）。
- **文章（article）**：讲解成果。

```
zheye.source                     -- 源材料
  id              TEXT PK
  title           TEXT NOT NULL DEFAULT ''
  text            TEXT NOT NULL             -- v1：粘贴的完整原文
  ref             TEXT NULL                 -- 来源备注（如原 URL；不做抓取）
  created_at      INTEGER NOT NULL

zheye.unit                       -- 讲解单元
  id              TEXT PK
  type            TEXT NOT NULL             -- 'concept' | 'statement' | 'doc'
  target          TEXT NOT NULL             -- 词 / 句原文；doc 单元为标题或指代
  source_id       TEXT NULL                 -- 来自哪篇材料（doc 单元必填；提取的词 / 句可记录）
  origin          TEXT NOT NULL             -- 'user' | 'extracted' | 'prerequisite'
  status          TEXT NOT NULL             -- 见下方状态机
  error           TEXT NULL                 -- 失败信息
  created_at      INTEGER NOT NULL
  updated_at      INTEGER NOT NULL

zheye.unit_prerequisite          -- 前置（边）
  unit_id         TEXT NOT NULL             -- 被讲单元
  position        INTEGER NOT NULL          -- 展示顺序
  text            TEXT NOT NULL             -- 前置要素（词或句）
  weight          TEXT NOT NULL             -- 'light' | 'heavy'
  answer          TEXT NULL                 -- 'known' | 'unknown'；light 与未询问为 NULL
  prerequisite_id TEXT NULL                 -- 对应的展开单元（复用或递归创建后回填）

zheye.article                    -- 讲解文章
  id              TEXT PK
  unit_id         TEXT NOT NULL             -- 1:1
  content_md      TEXT NOT NULL
  model           TEXT NULL
  usage           TEXT NULL                 -- JSON（token 用量）
  created_at      INTEGER NOT NULL
```

状态机（`unit.status`）：

```
checking     初始检查中（精读 + 前置提案）
awaiting     已提案前置，等待回答
queued       依赖已理清，在生成队列中
generating   正在生成文章（全局同一时刻至多一个）
ready        文章已完成
failed       失败（可重试）
```

- 就绪条件：单元进入 `queued`，当且仅当其全部**重前置**要么已回答「了解」、要么对应文章已 `ready`。
- 阶段产物（精读笔记、前置提案原始输出等）建议落库用于调试与追溯（实现时定，例如 `unit_artifact` 表）。

## 4. API（草案）

沿用两段式惯例：AI 解析是 read（异步、不落库），提交是 tx。

```ts
// —— 读（AI；异步、不落库）——
zheye.analyzeUnit({ unitId }) → { prerequisites: Array<{ text; weight: "light" | "heavy" }> }
  // 精读目标 + 前置提案
zheye.proposeUnits({ sourceId }) → { candidates: Array<{ type; target; reason? }> }
  // 从源材料提取「值得单独学的点」候选
zheye.generateArticle({ unitId }) → { contentMd; model; usage }
  // 生成文章（要求前置已就绪）

// —— 读（查询）——
zheye.listSources({}) → Source[]
zheye.listUnits({}) → UnitSummary[]          // 含状态，供学习列表 / 知识树
zheye.getUnit({ unitId }) → { unit; prerequisites; article? }
zheye.getArticle({ unitId }) → Article
zheye.getQueue({}) → { generating: UnitRef | null; queued: UnitRef[] }

// —— 写（kind: "tx"）——
zheye.addSource({ title?; text; ref? }) → { sourceId }
zheye.createUnit({ type; target; sourceId? }) → { unitId }    // 建后进入 checking，UI 触发 analyzeUnit
zheye.setPrerequisites({ unitId; prerequisites }) → { ok }    // 落前置提案
zheye.answerPrerequisites({ unitId; answers }) → { ok; createdUnits: UnitRef[] }
  // 落回答；对「不了解的重前置」在同一事务里创建子单元
zheye.saveArticle({ unitId; contentMd; model?; usage? }) → { ok }
zheye.failUnit({ unitId; error }) → { ok }
zheye.retryUnit({ unitId }) → { ok }
zheye.deleteUnit({ unitId }) → { ok }         // 级联规则待定（见 §10）
zheye.deleteSource({ sourceId }) → { ok }
```

说明：

- 递归展开由 UI 驱动 worklist：`analyzeUnit`（读）→ `setPrerequisites`（写）→ 用户回答 → `answerPrerequisites`（写；创建子单元）→ 对每个子单元重复，直到没有新的重前置。
- 生成队列同样由 UI 驱动（应用打开时逐篇跑）；关闭期间不生成，重开后按状态续跑。
- 平台 AI（`platform.ai.chat`）满足多轮调用、思考强度、usage 透传；工具循环所需的 messages 形状（`assistant.tool_calls` / `tool` 角色）已作为契约扩展加入（2026-10-07），无需内核结构改造。

## 5. 讲解与生成流程

### 5.1 总览

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

### 5.2 三类文章的模板（「讲透」的操作化定义）

**词（concept）**

1. 它为了解决什么问题而存在
2. 一句人话定义
3. 直觉与最小例子
4. 怎么运作（机制）
5. 边界与常见误解
6. 与相邻概念的关系

**句（statement：性质 / 结论 / insight / 现象 / 原型）**

1. 这句话在断言什么（拆开主语、量词、条件）
2. 为什么它不是显然的
3. 证据与机制
4. 适用范围与反例
5. 若成立意味着什么（推论 / 意义）

**文（doc：源材料）**

1. 它想解决什么问题
2. 主要贡献（2-3 条）
3. 论证路径（方法如何走到结论）
4. 在领域中的位置（为什么值得知道）
5. 局限与未决
6. 想深入原文时看哪几节

### 5.3 质量控制（rubric 草案）

生成后逐条检查（写作与检查共用同一份标准）：

- 核心论点、关键推理、重要前提一个不丢
- **难点必须被解开，不允许跳过难的部分**——这是「精读」与「摘要」的分界线
- 术语能不用就不用；出现即用白话解释
- 数学 / 形式化：先给直觉，再按需给细节
- 结构 = 论证骨架；每一步都知道在论证什么
- 开头直接给出「这篇在解决什么问题 / 你能获得什么」（为了定位，不是为了抓眼球）
- 真实性：不编造、推测不当定论（硬约束）
- takeaway 测试：读完能用自己的话复述
- 无注水；长度服从内容

### 5.4 配方与迭代

- 模板、rubric、各阶段提示词 = **配方**，以人可读文件（Markdown / TS 常量）随仓库走，由人与 Agent 快速迭代。
- 方案（实现时定）：`scripts/zheye-trial.ts`——喂一段文本，打印前置提案与各阶段产物 / 最终文章，用于在终端快速迭代配方（性质同 `ai:ping`）。
- 每篇文章记录所用配方版本（git 修订或显式版本号），保证可追溯。

## 6. 前台界面（草案）

- **三个区域**：
  - **原料池**：添加 / 查看源材料；对材料可「提取候选点」并挑选建单元；也可直接输入一个词 / 句建单元。
  - **学习列表（知识树）**：单元列表与状态（检查中 / 待回答 / 排队 / 生成中 / 可读 / 失败），标注前置关系；点开进入阅读或前置问答。
  - **阅读**：干净的 Markdown 排版；正文中的前置概念可点击跳到对应文章（已生成时）。
- **前置问答屏**：一屏列出该单元的全部「重前置」，每个两个选项（了解 / 不了解）+ 可选备注；提交后若有新的前置展开，继续下一屏。
- **生成队列指示**：顶栏轻量显示「正在生成《X》· 队列剩余 n 篇」（v1 无系统级通知）。
- 文案：中文（暂定）。

## 7. 非目标（v1 不做）

- 批注系统（方向已定，细节下一轮讨论，见 §8）
- 自动抓取 / 富输入（arxiv、网页、PDF、图片）
- 跨应用耦合（对话讨论、生词进词库）
- 文章重新生成 / 编辑
- 搜索、复习回顾、统计
- 应用内反馈与任何形式的用户画像
- 移动端适配与多端

## 8. 与未来的连接点

- **批注系统**（下一轮讨论）：方向已定——选中文字 → 批注（引文 + 迷你线程：你问 → AI 答 → 可追问）→ 永久留存、按锚点回看；正文保持干净；批注中的问题可「转成讲解单元」（人工下钻的入口）。「是否允许在批注里直接生成整篇文章」属另一个话题，一并留待下轮。远期想法：**AI 生成文章时自带的批注**——例如把原始推导以批注形式附在正文旁。
- **输入适配器**：arxiv（HTML 正文）、网页、PDF（解析质量后置考虑）。
- **跨应用**：dialog（把文章 / 批注拿去讨论）；vocab（文中生词进词库，复用 dialog 已规划的抓词机制）。
- **builder**：将来配方搬进数据库，由 builder 用自然语言编辑。
- **多端**：阅读场景尤其适合手机——文章是自包含文本，云端内核方案可直接承载（见 docs/future/multi-device.md）。

## 9. 工程落点（未实现，规划）

- `packages/contracts/src/zheye.ts`：zod 类型 + API 签名，加入 `ApiMap`。
- `apps/zheye/backend/src/index.ts`：`AppModule`（迁移 + API + 编排助手）；`apps/zheye/ui/`：静态 UI（零构建，沿用现有模式）。
- 配方文件（位置实现时定，如 `apps/zheye/pipeline/`）：三类模板、rubric、各阶段提示词。
- `apps/host/src/main/index.ts`：`registerApp(zheyeApp)` + `uiDirs.zheye`；`apps/host/package.json` 依赖。
- `scripts/zheye-trial.ts`：配方迭代试验脚本（见 §5.4）。
- 测试（`apps/zheye/test/`）：单元 / 前置 CRUD、回答后子单元创建、就绪条件与依赖顺序、串行队列与重开续跑、失败与重试、无 key → `PRECONDITION`。
- 内核无需改动；沿用「解析（read、不落库）→ 提交（tx）」与 UI 驱动编排。

## 10. 待决问题

1. 批注系统细节（下一轮讨论；届时另立规格或并入本文）。
2. 前置答案是否跨任务记忆 / 预填（避免反复问同一个词；与已否掉的口味画像是两回事，属任务数据）。
3. 检查与生成是否需要流水线化（边检查边生成，减少等待轮次）。
4. 同一前置文本的匹配与复用规则（何时直接引用已有文章、何时新建）。
5. 删除的级联规则（源材料 / 单元 / 文章 / 前置边）。
6. 输出语言策略最终确认（暂定中文）。
