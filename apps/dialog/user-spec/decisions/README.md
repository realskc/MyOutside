# 对话决策（DIALOG）

这里记录**对话应用专属**的决策；全局/跨应用的决策仍在 [`user-spec/decisions/`](../../../../user-spec/decisions/)。应用 spec 见 [`../README.md`](../README.md)，技术文档见 [`../../docs/README.md`](../../docs/README.md)。

## 约定

- 一条决策一个文件：`DIALOG-NNNN-简短英文标识.md`，编号四位、递增、永不复用。
- 引用写法：`DIALOG-0001`；同一目录内用相对链接。引用全局决策时写 `D-NNNN` 并链接到 [`user-spec/decisions/`](../../../../user-spec/decisions/)。
- 状态：`有效` / `已取代（→ DIALOG-xxxx）` / `已废弃`。决策文件不删除。
- 决策者：`作者` / `讨论` / `agent`。
- 模板、代价、重新考虑条件沿用 [`user-spec/decisions/README.md`](../../../../user-spec/decisions/README.md)。

## 索引

| 编号 | 标题 | 状态 |
|---|---|---|
| [DIALOG-0001](DIALOG-0001-message-tree.md) | 对话消息树：父指针 + 当前选中的分叉指针 | 有效 |
| [DIALOG-0002](DIALOG-0002-backend-orchestrated-reply.md) | 回复由对话应用的后端生成，整段返回，不做流式 | 部分被取代（→ DIALOG-0011、DIALOG-0016） |
| [DIALOG-0003](DIALOG-0003-edit-user-messages-only.md) | 只能编辑用户消息；暂不支持重新生成助手回复 | 部分被取代（→ DIALOG-0012） |
| [DIALOG-0004](DIALOG-0004-reasoning-display.md) | 思考强度按会话设置；思考过程折叠显示、不放进后续上下文 | 部分被取代（→ DIALOG-0016） |
| [DIALOG-0005](DIALOG-0005-context-budget.md) | 发给 AI 的上下文按约 100 万 token 的预算截断 | 有效 |
| [DIALOG-0006](DIALOG-0006-usage-display.md) | 用量显示：每条回复的明细 + 会话累计 | 已取代（→ DIALOG-0014） |
| [DIALOG-0007](DIALOG-0007-dialog-ui-details.md) | 对话界面细节 | 部分被取代（→ DIALOG-0015） |
| [DIALOG-0008](DIALOG-0008-dialog-search-v1-with-progress.md) | 对话搜索第一版就做进度推送 | 有效 |
| [DIALOG-0009](DIALOG-0009-web-search-toggle.md) | 对话的「联网搜索」开关：默认打开，打开时由模型决定搜不搜 | 有效 |
| [DIALOG-0010](DIALOG-0010-search-results-presentation.md) | 搜索结果的呈现：正文标注引用、下方列出来源（默认折叠）、搜索过程折叠 | 有效 |
| [DIALOG-0011](DIALOG-0011-streaming-output.md) | 对话回复逐字流式输出 | 有效 |
| [DIALOG-0012](DIALOG-0012-regenerate-reply.md) | 支持重新生成助手回复（在回复这一层分叉） | 有效 |
| [DIALOG-0013](DIALOG-0013-flash-only.md) | 对话固定使用 deepseek-flash，不提供模型选择 | 有效 |
| [DIALOG-0014](DIALOG-0014-show-current-context-length.md) | 用量显示改为突出当前上下文长度 | 有效 |
| [DIALOG-0015](DIALOG-0015-markdown-and-latex.md) | 对话回复渲染完整的 Markdown 与 LaTeX 公式 | 有效 |
| [DIALOG-0016](DIALOG-0016-dialog-generation-implementation.md) | 对话回复的生成与保存方式 | 有效 |
