# D-0079 用 Obsidian 查看和编辑文档：打开整个仓库，链接保持标准 Markdown

- 状态：有效
- 日期：2026-11-05
- 决策者：作者（用 Obsidian 组织文档；设置提交进仓库、两台电脑共用）；agent（具体设置）
- 服务于：
  - 作者预期：[references/obsidian「我们的想法」](../../references/obsidian/README.md)（用 Obsidian 来服务我们的 user spec）

## 决策

- 作者用 Obsidian 查看和编辑文档。**打开整个仓库作为库**，而不是只打开 `user-spec/`：链接会跨到 `apps/*/user-spec/`、`docs/`、`references/`，只开一个目录，跨目录的链接就断了。
- **文档里的链接保持标准 Markdown 相对链接**（`[文字](相对路径.md)`），不用 `[[双链]]`：GitHub、打包给网页端 agent 的文件、编码 agent 都只认标准链接。链接只指向文件，不指向文件夹（Obsidian 打不开指向文件夹的链接）。
- 设置在 `.obsidian/app.json`，提交进仓库，作者的两台电脑共用：
  - 用标准 Markdown 链接、相对路径；在 Obsidian 里移动或改名文件时自动更新链接；
  - 新笔记和粘贴的附件放在当前文件所在的文件夹（默认是库的根目录）；
  - 排除依赖与构建产物（`node_modules`、`apps/host/dist*`），否则依赖包里的几百个 README 会混进搜索和图谱。
- git 只忽略 `.obsidian/workspace*.json`（记录界面状态，一直在变）。

## 什么时候应该重新考虑

- 作者不再用 Obsidian；
- 想用 Obsidian 的 Bases 自动生成决策索引（需要把决策开头的状态、日期等改成文件顶部的元数据，会改变决策的写法）。
