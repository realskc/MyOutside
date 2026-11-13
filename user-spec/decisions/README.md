# 决策

一条决策记录：为了满足哪些作者预期，选择了怎样的实现，为什么。规则见 [../README.md](../README.md)。

## 约定

- **全局决策**用 `D-NNNN`，只记录跨应用/平台的决策；**应用专属决策**放在 `apps/<app>/user-spec/decisions/`，编号 `<APP>-NNNN`（如 `GO-0001`），由各应用的 `user-spec/decisions/README.md` 建索引。
- **一条决策一个文件**：`NNNN-简短英文标识.md`（全局）或 `GO-NNNN-...md`（应用）；编号四位、递增、永不复用。
- **引用写法**：全局 `D-0001`，链接到对应文件；应用决策用 `GO-0001`，链接到 `apps/<app>/user-spec/decisions/`。
- **状态**：`有效` / `已取代（→ D-xxxx）` / `已废弃`。决策文件不删除；被取代时，旧决策标注取代者，新决策标注取代了谁。
- **修改还是新建**：
  - **推翻决策**（换了方案、方向反转——按旧版本实现会做出不同的东西）→ **新建决策**取代旧的；
  - **小的修改**（补充细节、修措辞、更新状态、统一用词、补引用），或**修改刚定下的决策**（尚在打磨、还没实现）→ **原位修改**；
  - 原位修改不必写变更记录（git 历史可以看到）；但如果这次修改有**非平凡的理由**，在决策末尾的「修订记录」里写明改了什么、为什么。
- **修 bug**：每修一个 bug，都**新建一条决策**（应用里的 bug 记进应用的决策目录），写上「修复的 bug」一节（见模板）；如果 bug 出在某条已有决策的做法上，新决策标注取代了它的哪一部分。作者的要求见 [AGENTS.md「动手之后：记录决策」](../../AGENTS.md)。
- **决策者**：`作者` / `讨论`（作者与 agent 讨论后确定）/ `agent`（agent 基于作者需求自行决定，作者不一定看过）。
- 决策可以引用上游决策。

## 模板

```markdown
# D-NNNN 标题（一句话说清楚决定了什么）

- 状态：有效
- 日期：YYYY-MM-DD
- 决策者：作者 / 讨论 / agent
- 服务于：
  - 作者预期：[product.md「xxx」](../product.md)
  - 上游决策：D-xxxx

## 背景
面对什么问题，有哪些约束。

## 决策
决定怎么做。

## 考虑过、没有采用
- 方案 A：为什么没选。

## 代价
接受了哪些缺点。

## 什么时候应该重新考虑
出现哪些情况时，这条决策值得推翻。

## 修复的 bug（修 bug 时必写）
- 现象：用户 / 作者看到了什么，怎样复现；
- 原因：bug 是怎么产生的；
- 为什么原来的做法会出 bug：重构时**不能**再采用的做法；
- 怎么验证修好了：哪条测试或检查会在 bug 回来时失败。

## 修订记录（可选）
- YYYY-MM-DD：改了什么；为什么。
```

「考虑过、没有采用」「代价」「什么时候应该重新考虑」可以在确实没有内容时省略，但应尽量写——它们是将来推翻决策时最有用的信息。「修复的 bug」在修 bug 的决策里必写，不能省略。「修订记录」只在原位修改有非平凡理由时才写。

## 鼓励推翻决策

**在符合作者预期的前提下，我们鼓励决策被推翻。** 因此要如实记录一条决策有多"硬"，不要把随手的选择写得像深思熟虑：

- 没有强烈理由、只是随便选了一种方案（agent 自己定的尤其常见）→「什么时候应该重新考虑」写 **随时可以**；
- agent 问作者、作者选了某个选项但没说原因 → 理由写 **作者没说原因**；
- 作者表达了「随便，就选方案 A」→ 理由写 **作者没有强烈的原因**，「什么时候应该重新考虑」写 **随时可以**。

只有真正有支撑的决策，才写具体的重新考虑条件。

## 索引

| 编号 | 标题 | 状态 |
|---|---|---|
| [D-0001](0001-one-off-functions.md) | 一次性需求以「临时函数」完成：软门槛、自动留痕、无晋升 | 有效 |
| [D-0002](0002-electron-host.md) | 桌面程序使用 Electron | 有效 |
| [D-0003](0003-single-language-typescript.md) | 全项目单一语言：TypeScript | 有效 |
| [D-0004](0004-sqlite-single-writer-queue.md) | 数据存储：SQLite 单文件，内核是唯一写入者，写操作串行排队 | 有效 |
| [D-0005](0005-data-ownership-by-table-prefix.md) | 数据归属：按应用划分表，禁止跨应用共用表 | 有效 |
| [D-0006](0006-cross-app-calls-via-owner-api.md) | 跨应用通道：只能调用对方的 API 函数，分事务内与事务外两种语义 | 有效 |
| [D-0007](0007-sync-pure-tx-functions.md) | API 分事务 API 与只读 API 两类；事务 API 必须同步、纯数据 | 部分被取代（→ D-0063） |
| [D-0008](0008-resolve-then-commit.md) | AI 辅助的写操作：先解析、后提交 | 部分被取代（→ D-0063） |
| [D-0009](0009-refresh-on-activate.md) | 不做实时推送：面板激活时比对数据版本再刷新 | 有效（「不推送」部分被 D-0051 取代） |
| [D-0010](0010-single-window-single-active-panel.md) | 单窗口，同一时刻只有一个活动面板 | 有效 |
| [D-0011](0011-static-js-app-ui.md) | 子应用界面：零构建的静态 HTML / JS | 有效（计划改为 TS） |
| [D-0012](0012-runtime-agnostic-kernel.md) | 内核、契约与子应用后端保持运行时无关 | 有效 |
| [D-0013](0013-cloud-kernel-for-multi-device.md) | 多端方案：云端内核 | 有效（未实施） |
| [D-0014](0014-deepseek-as-ai-provider.md) | 平台 AI 使用 DeepSeek | 有效 |
| [D-0015](0015-bilingual-ui.md) | 界面中英双语 | 有效 |
| [D-0016](0016-single-instance-and-launcher.md) | 单实例运行；Windows 双击快捷方式、macOS 终端命令启动 | 有效 |
| [D-0017](0017-per-app-hot-reload.md) | 开发时按子应用热重载（reloadApp） | 有效（未实现；推迟到做 builder 时） |
| [D-0018](0018-iframe-panel-and-app-protocol.md) | 子应用面板：一个 iframe + app:// 自定义协议 | 有效 |
| [D-0019](0019-api-key-in-platform-settings.md) | AI 密钥存在平台设置里（明文） | 部分被取代（→ D-0075） |
| [D-0020](0020-mobile-via-web-ui.md) | 移动端用同一套 Web 界面承载，不做原生 App | 有效（未实施） |
| [D-0021](0021-card-is-term-plus-sense.md) | 卡片数据模型：一张卡片 = 单词 + 本质意项 | 弃用（→ VOCAB-0001） |
| [D-0022](0022-dedup-on-add.md) | 添加卡片时的查重：机械检查拼写 + AI 判断是否同义，不自动合并 | 弃用（→ VOCAB-0002） |
| [D-0023](0023-mastery-is-manual.md) | 「已掌握」完全由用户手动标记 | 弃用（→ VOCAB-0003） |
| [D-0024](0024-card-content-in-chinese.md) | AI 生成的卡片内容一律用中文，例句保持英文 | 弃用（→ VOCAB-0004） |
| [D-0025](0025-toefl-word-levels.md) | 导入《词以类记》托福分级作为参考词表 | 弃用（→ VOCAB-0005） |
| [D-0026](0026-fsrs-scheduling.md) | 复习调度使用 FSRS（ts-fsrs） | 弃用（→ VOCAB-0006） |
| [D-0027](0027-ai-lookup.md) | 查词：AI 翻译解说并生成卡片草稿 | 弃用（→ VOCAB-0007） |
| [D-0028](0028-review-screen.md) | 复习界面：三个评分按钮 +「完全学会」 | 弃用（→ VOCAB-0008） |
| [D-0029](0029-message-tree.md) | 对话消息树：父指针 + 当前选中的分叉指针 | 弃用（→ DIALOG-0001） |
| [D-0030](0030-backend-orchestrated-reply.md) | 回复由对话应用的后端生成，整段返回，不做流式 | 弃用（→ DIALOG-0002） |
| [D-0031](0031-edit-user-messages-only.md) | 只能编辑用户消息；暂不支持重新生成助手回复 | 弃用（→ DIALOG-0003） |
| [D-0032](0032-reasoning-display.md) | 思考强度按会话设置；思考过程折叠显示、不放进后续上下文 | 弃用（→ DIALOG-0004） |
| [D-0033](0033-context-budget.md) | 发给 AI 的上下文按约 100 万 token 的预算截断 | 弃用（→ DIALOG-0005） |
| [D-0034](0034-usage-display.md) | 用量显示：每条回复的明细 + 会话累计 | 弃用（→ DIALOG-0006） |
| [D-0035](0035-dialog-ui-details.md) | 对话界面细节 | 弃用（→ DIALOG-0007） |
| [D-0036](0036-zheye-explanation-units.md) | 哲野的讲解单元：词 / 句 / 文三种，三种来源 | 弃用（→ ZHEYE-0001） |
| [D-0037](0037-zheye-prerequisites.md) | 哲野的前置检查：轻 / 重前置，只问重前置，全递归 | 弃用（→ ZHEYE-0002） |
| [D-0038](0038-zheye-generation.md) | 哲野的生成：自动开始，全局串行，按依赖顺序，生成后固定 | 弃用（→ ZHEYE-0003） |
| [D-0039](0039-zheye-article-templates.md) | 哲野的三类文章模板 | 弃用（→ ZHEYE-0004） |
| [D-0040](0040-zheye-rubric.md) | 哲野的质量标准（rubric） | 弃用（→ ZHEYE-0005） |
| [D-0041](0041-zheye-no-profiling.md) | 哲野不做口味档案、不做应用内反馈；不要求高保真 | 弃用（→ ZHEYE-0006） |
| [D-0042](0042-zheye-recipes-in-repo.md) | 哲野的配方以人可读文件随仓库版本化 | 弃用（→ ZHEYE-0007） |
| [D-0043](0043-zheye-v1-scope.md) | 哲野 v1 的范围 | 弃用（→ ZHEYE-0008） |
| [D-0044](0044-docs-sync-with-features.md) | 功能提交时同步更新 README 与相关文档 | 有效 |
| [D-0045](0045-commit-and-test-conventions.md) | 提交信息与测试规范 | 有效 |
| [D-0046](0046-smoke-on-temp-data-copy.md) | 冒烟测试在真实数据的临时副本上运行 | 有效 |
| [D-0047](0047-current-stage-non-goals.md) | 现阶段不做的事 | 有效 |
| [D-0048](0048-self-built-agent-library.md) | agent 框架自研，不引入开源 agent 框架 | 有效 |
| [D-0049](0049-agent-layering.md) | agent 能力分四部分：执行层承载循环，循环调用模型层与工具层 | 部分被取代（→ D-0061、D-0062、D-0063） |
| [D-0050](0050-web-tools-as-platform-api.md) | 搜索与抓取做成平台 API | 有效 |
| [D-0051](0051-event-centric-agent-runs.md) | agent 运行以事件为中心；流式输出与进度显示共用推送通道 | 有效 |
| [D-0052](0052-agent-execution-modes.md) | agent 的两种运行模式：调用内运行先行，后台任务后置 | 已取代（→ D-0061、D-0062、D-0063） |
| [D-0053](0053-kernel-enforced-call-permissions.md) | 调用权限：应用声明自己会调用哪些函数，内核强制检查 | 有效 |
| [D-0054](0054-dialog-search-v1-with-progress.md) | 对话搜索第一版就做进度推送 | 弃用（→ DIALOG-0008） |
| [D-0055](0055-web-search-toggle.md) | 对话的「联网搜索」开关：默认打开，打开时由模型决定搜不搜 | 弃用（→ DIALOG-0009） |
| [D-0056](0056-app-manifest.md) | 应用清单（manifest）的内容与形式：每个子应用一份 JSON 文件 | 有效 |
| [D-0057](0057-track-word-levels-data.md) | 参考词表数据随仓库提交；`.gitignore` 只忽略根目录 `data/` | 弃用（→ VOCAB-0009） |
| [D-0058](0058-public-and-internal-functions.md) | 前端调用后端也经过内核；函数分公开与内部 | 有效 |
| [D-0059](0059-no-tool-choice.md) | 不使用 `tool_choice` 的强制调用 | 有效 |
| [D-0060](0060-tool-loop-ends-without-tool-calls.md) | 工具循环在模型不调用工具时结束 | 有效（暂时） |
| [D-0061](0061-agent-structures-as-platform-base-classes.md) | 通用 agent 结构以平台基类提供，数据存在子应用自己的表空间 | 有效（未实现） |
| [D-0062](0062-workflow-persistence-is-app-responsibility.md) | 工作流的暂停与恢复由子应用自己解决，平台不提供通用的重放机制 | 有效 |
| [D-0063](0063-internal-apis-may-be-async-functions.md) | 写数据只能通过事务 API；公开 API 只能是只读或事务，内部 API 还可以是普通的异步函数 | 部分被取代（→ D-0086） |
| [D-0064](0064-search-results-presentation.md) | 搜索结果的呈现：正文标注引用、下方列出来源、搜索过程折叠 | 弃用（→ DIALOG-0010） |
| [D-0065](0065-streaming-output.md) | 对话回复逐字流式输出 | 弃用（→ DIALOG-0011） |
| [D-0066](0066-regenerate-reply.md) | 支持重新生成助手回复（在回复这一层分叉） | 弃用（→ DIALOG-0012） |
| [D-0067](0067-flash-only.md) | 对话固定使用 deepseek-flash，不提供模型选择 | 弃用（→ DIALOG-0013） |
| [D-0068](0068-show-current-context-length.md) | 用量显示改为突出当前上下文长度 | 弃用（→ DIALOG-0014） |
| [D-0069](0069-markdown-and-latex.md) | 对话回复渲染完整的 Markdown 与 LaTeX 公式 | 弃用（→ DIALOG-0015） |
| [D-0070](0070-kernel-permissions-implementation.md) | 调用者识别、权限检查与清单的实现方式 | 有效 |
| [D-0071](0071-dialog-generation-implementation.md) | 对话回复的生成与保存方式 | 弃用（→ DIALOG-0016） |
| [D-0072](0072-dev-lan-preview.md) | 开发用 LAN 预览：Electron 主进程内加可选 HTTP 宿主 | 有效 |
| [D-0073](0073-app-local-decisions.md) | 应用自包含：spec/docs/decisions 在 apps/<app>/ 内按层组织 | 有效 |
| [D-0074](0074-usage-and-cost-display.md) | 用量与花费：按子应用统计，按官方价格与调用时段估算 | 有效 |
| [D-0075](0075-credentials-encrypted-with-keychain.md) | 凭据用系统钥匙串加密保存 | 有效 |
| [D-0076](0076-app-background-work-on-startup.md) | 子应用可以在 MyOutside 启动时开始后台工作 | 有效（未实现） |
| [D-0077](0077-open-app-file.md) | 子应用可以请外壳用系统默认程序打开自己目录下的文本文件 | 有效 |
| [D-0078](0078-tools-unchanged-within-conversation.md) | 对话中不改动工具定义；轮数用完时用 tool_choice = none | 有效 |
| [D-0079](0079-obsidian-for-docs.md) | 用 Obsidian 查看和编辑文档：打开整个仓库，链接保持标准 Markdown | 有效 |
| [D-0080](0080-device-access.md) | 设备上的数据是普通文件夹；子应用访问设备要在清单里登记，经内核与设备之间的通道 | 有效（未实现） |
| [D-0081](0081-app-table-prefix.md) | 所有应用的物理表名统一加 `app_` 前缀；应用 id 可数字开头 | 有效 |
| [D-0082](0082-raw-ai-request-api.md) | 实验用的原始 AI 请求 API（platform.ai.chatRaw）：原样透传请求体与响应 | 有效 |
| [D-0083](0083-project-license.md) | 项目代码使用 Apache-2.0；第三方代码与模型权重单独处理 | 有效 |
| [D-0084](0084-raw-ai-stop-while-reading-body.md) | 原始 AI 请求在读响应体时被停止，统一报「已取消」（修复实验室停止被记成失败） | 有效 |
| [D-0085](0085-workflow-merged-into-agents-md.md) | 开发方式并入 AGENTS.md；AGENTS.md 属于 user spec | 有效 |
| [D-0086](0086-public-async-functions.md) | 普通 API 也可以公开；长事务式的流程，冲突由所有者自己挡 | 有效 |
| [D-0087](0087-server-baseline-security.md) | 云服务器的基本安全设置：只用密钥登录 SSH，防火墙只开 22，fail2ban，自动装安全更新 | 有效 |
| [D-0088](0088-domain-dns.md) | 域名 myoutside.org 的 DNS：不走 Cloudflare 代理，www 作别名，声明不发邮件 | 有效 |
| [D-0089](0089-caddy-as-front.md) | 服务器的对外入口用 Caddy：自动 HTTPS，先放占位页 | 有效 |
| [D-0090](0090-sandboxed-app-frames.md) | 浏览器里，子应用的界面放进沙箱 iframe；外壳按消息来自哪个 iframe 认出调用者 | 有效 |
| [D-0091](0091-one-database-per-user.md) | 多用户：每个用户一个独立的数据库，服务器为每个用户各开一份内核 | 有效 |
| [D-0092](0092-backup-to-r2.md) | 服务器数据的备份：每天打一个加密包传到 Cloudflare R2，按规则自动删、锁定期内谁也删不掉 | 有效（每月恢复演练被 D-0096 取代） |
| [D-0093](0093-login-and-server-hardening.md) | 登录与服务器的安全：没登录时能碰的最少、处处限大小、限次数但不为难人、服务进程关在低权限里 | 有效 |
| [D-0094](0094-spec-faithful-editorial-maintenance.md) | 统一 user spec 的记录规则，以忠实性和可读性共同检查 | 有效 |
| [D-0095](0095-independent-codex-gateway-entry.md) | Caddy 保留独立 CodexGateway 的入口 | 有效 |
| [D-0096](0096-backup-completion-and-fixes.md) | 备份补全：每次备份都做完整恢复检查，部署前也传 R2，网页上看得到备份状态；修正星期天和 1 号按 UTC 算 | 有效 |

## 应用专属决策

| 应用 | 目录 |
|---|---|
| 围棋（go） | [`apps/go/user-spec/`](../../apps/go/user-spec/README.md) · [decisions](../../apps/go/user-spec/decisions/README.md) · [docs](../../apps/go/docs/README.md) |
| 学英语（vocab） | [`apps/vocab/user-spec/`](../../apps/vocab/user-spec/README.md) · [decisions](../../apps/vocab/user-spec/decisions/README.md) · [docs](../../apps/vocab/docs/README.md) |
| 对话（dialog） | [`apps/dialog/user-spec/`](../../apps/dialog/user-spec/README.md) · [decisions](../../apps/dialog/user-spec/decisions/README.md) · [docs](../../apps/dialog/docs/README.md) |
| 哲野（zheye） | [`apps/zheye/user-spec/`](../../apps/zheye/user-spec/README.md) · [decisions](../../apps/zheye/user-spec/decisions/README.md) · [docs](../../apps/zheye/docs/README.md) |
| 纯蓝（66CCFF） | [`apps/66CCFF/user-spec/`](../../apps/66CCFF/user-spec/README.md) · [decisions](../../apps/66CCFF/user-spec/decisions/README.md) · [docs](../../apps/66CCFF/docs/README.md) |
