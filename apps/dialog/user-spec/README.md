# 对话（dialog）

> 这是对话自己的作者预期。技术文档见 [`../docs/README.md`](../docs/README.md)；决策见 [`decisions/`](decisions/README.md)。

## 定位

- **目前要能作为作者的主力 AI 对话工具。** 原因：DeepSeek 没有提供完整的官方网页版对话平台（官方网页端是低级模型的免费版），而作者想用 DeepSeek 的完整能力。
- 将来可能发展成**个人知识库**。
- 现在还很简陋，**接下来要加上搜索等功能**（搜索的交互见 [DIALOG-0008](decisions/DIALOG-0008-dialog-search-v1-with-progress.md)、[DIALOG-0009](decisions/DIALOG-0009-web-search-toggle.md)）。

## 对话历史

- **所有消息永久保留**，包括所有分叉；不会自动清理。
- **树形历史**：编辑一条已发送的消息，就产生一个新的分叉；旧的分叉保留，可以随时切换回去（数据模型见 [DIALOG-0001](decisions/DIALOG-0001-message-tree.md)）。

## 用量

- **需要知道当前对话的上下文长度**（用了多少 token）。
- 开销目前不太高，暂时不太关心；但子应用增多、分发给其他人以后，一定要有按子应用的、更严格的 token 用量管控与显示（见 `platform.md`「平台 AI」；用量与花费的显示已有，见 [D-0074](../../../user-spec/decisions/0074-usage-and-cost-display.md)）。
- 显示方式见 [DIALOG-0014](decisions/DIALOG-0014-show-current-context-length.md)。

## 与其他应用的连接

- 选中对话里的生词直接加进学英语的词库（抓词）：不急，暂时不做。

## 实现相关的决策

- 回复生成方式：[DIALOG-0002](decisions/DIALOG-0002-backend-orchestrated-reply.md)；逐字流式输出：[DIALOG-0011](decisions/DIALOG-0011-streaming-output.md)
- 编辑与重新生成：[DIALOG-0003](decisions/DIALOG-0003-edit-user-messages-only.md)、[DIALOG-0012](decisions/DIALOG-0012-regenerate-reply.md)
- 思考强度与思考过程：[DIALOG-0004](decisions/DIALOG-0004-reasoning-display.md)
- 上下文预算：[DIALOG-0005](decisions/DIALOG-0005-context-budget.md)
- 搜索结果的呈现：[DIALOG-0010](decisions/DIALOG-0010-search-results-presentation.md)
- 模型：固定使用 deepseek-flash，[DIALOG-0013](decisions/DIALOG-0013-flash-only.md)
- 界面细节：[DIALOG-0007](decisions/DIALOG-0007-dialog-ui-details.md)；Markdown 与 LaTeX 渲染：[DIALOG-0015](decisions/DIALOG-0015-markdown-and-latex.md)

## 未定

- 「个人知识库」的具体形态。
- 发图片、发文件（DeepSeek Flash 能看图，接口支持上传文件）：先不管。
