# Obsidian

- 官网：https://obsidian.md
- 资料最近核对：2026-11-05
- 我们的想法：[Obsidian-thoughts.md](Obsidian-thoughts.md)

## 是什么

- 本地优先的 Markdown 笔记软件。一个「库」（vault）就是电脑上的一个普通文件夹，每篇笔记是一个 `.md` 文件。
- 主要功能：双向链接（`[[笔记名]]`）与反向链接、关系图谱、Canvas 白板、Bases（把笔记当成数据库，用表格、看板等视图查看）。
- 桌面端基于 Electron（1.14.5 把 Electron 升级到 43.8.3，见[更新日志](https://obsidian.md/changelog)）；另有 iOS、Android 版。当前版本 1.15（2026-11-02）。

## 人们用它做什么

- CEO 的说法：很多人用它记录想法、写日记；很多用户是学生，用它追踪学习进度、整理研究笔记；也有作家、写书的人，甚至 RPG 爱好者。（The Verge Decoder 播客，[2025-08-18](https://www.theverge.com/decoder-podcast-with-nilay-patel/760522/obsidian-ceo-steph-ango-kepano-productivity-software-notes-app)）
- 2026 年 4 月起流行的一种用法：Andrej Karpathy 的「LLM 知识库」（LLM Wiki）。把原始资料（文章、论文、代码库、图片等）放进 `raw/` 文件夹，让 LLM 把它们逐步「编译」成一个 wiki：一堆互相链接的 `.md` 文件，有资料摘要、概念文章和反向链接；提问的回答也写回 wiki；定期让 LLM 做「体检」（找矛盾、补缺、找新的联系）。wiki 几乎全由 LLM 写和维护，他自己很少直接改，Obsidian 只用来浏览。原话：「Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase.」（[推文，2026-04-02](https://x.com/karpathy/status/2039805659525644595)；详见 [LLM-Wiki.md](LLM-Wiki.md)）

## 开放程度

- 本体闭源。插件接口的类型定义公开（[obsidian-api](https://github.com/obsidianmd/obsidian-api)）；官方登记的社区插件有 9960 个（[community-plugins.json](https://github.com/obsidianmd/obsidian-releases)，2026-11-05 统计）。
- 数据是普通的 Markdown 文件，任何程序都能直接读写。
- 官方命令行（1.12 起）几乎能做界面上能做的所有事，但它遥控的是正在运行的 Obsidian：程序没开，第一条命令会先把它打开（[Obsidian CLI](https://obsidian.md/help/cli)）。不开界面也能运行的官方组件只有 Obsidian Headless，只负责同步，需要订阅 Sync。
- CEO Steph Ango 发布了一套 agent skills，教 AI agent 使用 Obsidian 命令行和它的文件格式（Markdown、Bases、JSON Canvas）（[obsidian-skills](https://github.com/kepano/obsidian-skills)）。

## 插件

- 两种：
  - **核心插件**：官方自带，只能开关，例如日记、模板、Canvas 白板、Bases、关系图谱、反向链接、同步、发布、网页浏览器（完整列表见库里的 `.obsidian/core-plugins.json`）；
  - **社区插件**：第三方用 JavaScript 写的，官方目录里有 9960 个（2026-11-05 统计，见上文「开放程度」）。
- 下载量最多的社区插件（[community-plugin-stats.json](https://github.com/obsidianmd/obsidian-releases)，2026-11-05 统计）：

  | 插件 | 下载量 | 做什么 |
  |---|---|---|
  | Excalidraw | 891 万 | 手绘风格的白板和画图 |
  | Templater | 610 万 | 带脚本的动态模板 |
  | Dataview | 526 万 | 把笔记当数据库查询，生成表格和列表 |
  | Tasks | 457 万 | 跨笔记的任务管理：截止日期、重复任务 |
  | Git | 340 万 | 用 git 自动备份和同步库 |
  | Advanced Tables | 334 万 | 更好用的 Markdown 表格编辑 |
  | Calendar | 325 万 | 用日历浏览日记 |
  | Copilot | 325 万 | 在库里运行 Claude Code、Codex、OpenCode 等 AI agent |
  | Style Settings | 283 万 | 调整主题和插件的样式变量 |
  | Kanban | 281 万 | 用 Markdown 存的看板 |
  | Claudian | 262 万 | 把 Claude Code、Codex 等本地 agent 嵌进库里 |

- 安全（[Plugin security](https://obsidian.md/help/plugin-security)）：
  - 默认是「限制模式」，不运行任何第三方代码；要装社区插件得先关掉它。
  - 插件继承 Obsidian 的全部权限，官方说技术上做不到按权限限制：插件能读写电脑上的文件、联网、安装其他程序。
  - 每个插件版本都会被自动扫描（安全漏洞、代码质量、恶意软件），结果在插件页上显示为安全评分卡；热门、精选和被举报的插件还有人工审核。社区插件不会自动更新。
  - 开发者政策（[Developer policies](https://docs.obsidian.md/Developer+policies)）：不许混淆代码、不许客户端遥测、不许自己安装或更新依赖；联网、访问库以外的文件、需要付费或账号等，必须在说明里写清楚。

## 社区

- 官方入口（[Community](https://obsidian.md/community)）：
  - [论坛](https://forum.obsidian.md)：功能请求、报告问题、关于知识管理的深入讨论。「[Share & showcase](https://forum.obsidian.md/c/share-showcase/9)」版块专门分享用法，分「Workflows & Templates」（工作流与模板）、「Themes & CSS snippets」、「Plugins」三个子版块；
  - [中文论坛](https://forum-zh.obsidian.md)；
  - Discord：求助、提问、认识其他用户、看别人的配置；
  - 社交媒体：X（@obsdmd）、Bluesky、Threads、Mastodon、YouTube、GitHub。
- 论坛「Workflows & Templates」里能看到的用法举例（2026 年）：圣经学习套件（约 10 万次浏览）、出租房产管理、生理周期记录、个人 CRM、大学课程笔记、写剧本、用地图视图规划旅行、玩 Steam 游戏时自动记笔记；也有很多帖子讲把 Claude Code 等 AI agent 用在库里。
- 周报：
  - Obsidian Roundup（版主 Eleanor Konik，2021-04 至 2023-06，已停更）；
  - [This Week in Obsidian](https://thisweekinobsidian.substack.com)（社区成员写的英文周报，2025 年底开始，每周二）；
  - [PKMer 的 Obsidian 社区周报](https://pkmer.cn/Pkmer-Docs/10-obsidian/obsidian%E7%A4%BE%E5%8C%BA%E5%91%A8%E6%8A%A5/obsidian%E7%A4%BE%E5%8C%BA%E5%91%A8%E6%8A%A5)（中文，最近一期 2026-09-30）。
- [Obsidian Hub](https://publish.obsidian.md/hub)：社区维护的资料库（本身就是一个用 Obsidian Publish 发布的库）。

## 收费

见[定价](https://obsidian.md/pricing)：

- 软件免费，不用注册；商用也不要求付费（在机构里工作使用时鼓励购买商用授权，每人每年 50 美元）。
- 收费服务：Sync（年付每月 4 美元）、Publish（年付每个站点每月 8 美元）。
- 官方说法：100% 由用户支持，不靠投资人；应用不收集遥测数据。

## 理念

- 「File over app」（Steph Ango，[2023-07-01](https://stephango.com/file-over-app)）：想让数字作品留存下来，它们必须是你能掌控的文件，格式易于读取；应用是短暂的，文件才有机会留存。

## 智能

- 本体没有内置 AI，唯一的例外是 Web Clipper 里的 Interpreter（保存网页时用提示词补充信息），而且是刻意放在 Obsidian 之外的。理由：不想让 AI 替代用户的思考过程；数据要私密，不能默认发给 AI 服务商。AI 插件是社区里增长最快的插件类别。（Steph Ango 在 The Verge Decoder 播客，[2025-08-18](https://www.theverge.com/decoder-podcast-with-nilay-patel/760522/obsidian-ceo-steph-ango-kepano-productivity-software-notes-app)）
- 到 2026 年中仍没有内置 AI（[Sébastien Dubois，2026-06-02](https://www.dsebastien.net/obsidian-ai-plugins)）。
