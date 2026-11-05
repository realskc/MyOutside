# Obsidian

- 官网：https://obsidian.md
- 资料最近核对：2026-11-05

## 资料

### 是什么

- 本地优先的 Markdown 笔记软件。一个「库」（vault）就是电脑上的一个普通文件夹，每篇笔记是一个 `.md` 文件。
- 主要功能：双向链接（`[[笔记名]]`）与反向链接、关系图谱、Canvas 白板、Bases（把笔记当成数据库，用表格、看板等视图查看）。
- 桌面端基于 Electron（1.14.5 把 Electron 升级到 43.8.3，见[更新日志](https://obsidian.md/changelog)）；另有 iOS、Android 版。当前版本 1.15（2026-11-02）。

### 开放程度

- 本体闭源。插件接口的类型定义公开（[obsidian-api](https://github.com/obsidianmd/obsidian-api)）；官方登记的社区插件有 9960 个（[community-plugins.json](https://github.com/obsidianmd/obsidian-releases)，2026-11-05 统计）。
- 数据是普通的 Markdown 文件，任何程序都能直接读写。
- 官方命令行（1.12 起）几乎能做界面上能做的所有事，但它遥控的是正在运行的 Obsidian：程序没开，第一条命令会先把它打开（[Obsidian CLI](https://obsidian.md/help/cli)）。不开界面也能运行的官方组件只有 Obsidian Headless，只负责同步，需要订阅 Sync。
- CEO Steph Ango 发布了一套 agent skills，教 AI agent 使用 Obsidian 命令行和它的文件格式（Markdown、Bases、JSON Canvas）（[obsidian-skills](https://github.com/kepano/obsidian-skills)）。

### 收费

见[定价](https://obsidian.md/pricing)：

- 软件免费，不用注册；商用也不要求付费（在机构里工作使用时鼓励购买商用授权，每人每年 50 美元）。
- 收费服务：Sync（年付每月 4 美元）、Publish（年付每个站点每月 8 美元）。
- 官方说法：100% 由用户支持，不靠投资人；应用不收集遥测数据。

### 理念

- 「File over app」（Steph Ango，[2023-07-01](https://stephango.com/file-over-app)）：想让数字作品留存下来，它们必须是你能掌控的文件，格式易于读取；应用是短暂的，文件才有机会留存。

### 智能

- 本体没有内置 AI，唯一的例外是 Web Clipper 里的 Interpreter（保存网页时用提示词补充信息），而且是刻意放在 Obsidian 之外的。理由：不想让 AI 替代用户的思考过程；数据要私密，不能默认发给 AI 服务商。AI 插件是社区里增长最快的插件类别。（Steph Ango 在 The Verge Decoder 播客，[2025-08-18](https://www.theverge.com/decoder-podcast-with-nilay-patel/760522/obsidian-ceo-steph-ango-kepano-productivity-software-notes-app)）
- 到 2026 年中仍没有内置 AI（[Sébastien Dubois，2026-06-02](https://www.dsebastien.net/obsidian-ai-plugins)）。

## 我们的想法

- 作者感觉它更像是一个「知识的家园」（2026-11-05）。
- 它的「家」，住的主要是知识，而不是人（agent 提出，作者认可）：
  - 「File over app」的意思是，要长久留下来的是文件，应用会过时。真正住在里面、要一直住下去的是笔记。
  - 它刻意不内置 AI，理由是不想让 AI 替代你的思考。所以这是一个让你自己整理思考的地方，安静，不沾「灵气」。
  - 里面的知识大多是你自己写下的；哲野不太一样，它是 AI 讲给你听的知识。
- 如果 MyOutside 能做出来、做得好，就一定会直接覆盖 Obsidian 的能力；这块能力只是我们宏大计划的一小部分而已。作者以后也许会进入 Obsidian 社区，看看里面的人在关注什么、有怎样的活动和需求。
- 作者在想：我们的文档，尤其是 user spec，能不能用 Obsidian 的方式来组织，也就是用 Obsidian 这个产品来服务于我们的 user spec。（已开始用，见 [D-0079](../user-spec/decisions/0079-obsidian-for-docs.md)）
