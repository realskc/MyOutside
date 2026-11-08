# AGENTS.md

> ⚠️ **用词约定：「作者」与「用户」**
> 本项目的文档里，**「作者」指项目作者本人**（掌控 MyOutside 的设计与定位，也是和你协作的那个人）；**「用户」指使用 MyOutside 产品的人**。
> 在 agent 领域，「用户」通常指和 agent 对话的人——**在本项目里，这个人叫「作者」**。编写或修改任何文档（包括本文件）时，指项目作者本人请写「作者」，不要写「用户」。概念定义见 `user-spec/concepts/actors.md`。

## 动手之前：先读 user spec

`user-spec/` 记录作者对 MyOutside 的预期，是整个项目的源头；各子应用的作者预期放在 `apps/<app>/user-spec/`；`docs/` 与 `apps/<app>/docs/` 下是技术文档（派生物）。`references/` 记录其他产品与项目：资料 agent 可以自行补充，想法（`<项目名>-thoughts.md`）只记作者说的或作者明确认可的（见 `references/README.md`）。应用专属的外部资料放 `apps/<app>/references/`，格式与主 `references/` 相同；主 `references/` 只放跨应用 / 平台级资料。

作者用 Obsidian 查看和编辑文档（整个仓库就是一个库）：文档里的链接一律用标准 Markdown 相对链接，指向文件而不是文件夹，不用 `[[双链]]`（见 [D-0079](user-spec/decisions/0079-obsidian-for-docs.md)）。

1. 先读 `user-spec/README.md`，了解两层内容（spec 文档 / 决策）与变更规则；
2. 改动之前，读与改动相关的 spec 文档与决策：
   - spec 文档中未引用决策的叙述 = 作者的预期 = 承重墙，不得自行改变；要动它，先与作者讨论；
   - 决策 = 为满足预期而选择的实现，可以推翻，但推翻时写新决策取代旧决策；
3. 发现需求与 spec 冲突时，停下来问作者："是我理解错了，还是你改主意了？"

## 不写兼容旧版本的代码

兼容旧版本（旧数据格式、旧接口、旧行为）的代码，只有 user spec 里写了对应的兼容要求时才写；开发阶段默认没有任何兼容要求。旧数据的迁移在作者的两台设备上各做一次就完，不留迁移代码。表结构变更照常新加迁移步骤，不要并进 `0001_init`；统一压缩只在发行之前或作者提出时做（见 `user-spec/workflow.md`「当前阶段的节奏」、`user-spec/principles.md`「只看 user spec 就能重构项目」）。

## 和作者沟通

按 `user-spec/workflow.md`「和 agent 的合作方式」汇报：每件事标明需要作者做什么（🔴 需要决策 / 同意 / 理解，🟡 只需知道，⚪ 不用管），尽量一同讲清后果；修改了 user spec（不含决策）时，在回答末尾用 🟢 简要说明改了什么。

## 提交与推送

- agent 可以自己 commit，推荐在完成一项工作后自动 commit；
- **push 只在作者提出时才做，不能擅自 push**（见 `user-spec/workflow.md`「工程规范」）。

## 动手之后：记录决策

- 基于作者需求做出的实现决定：全局/跨应用的记进 `user-spec/decisions/`（`D-NNNN`）；应用专属的记进 `apps/<app>/user-spec/decisions/`（如 `apps/go/user-spec/decisions/`，`GO-0001`）。写法见对应目录的 `README.md`，决策者填 `agent`；
- 作者亲自规定的细节，决策者填 `作者`，并把背后的高层次考量写进 spec 文档（子应用的写进 `apps/<app>/user-spec/`）；
- **修 bug 必须新建一条决策**，写上「修复的 bug」一节：现象、原因、为什么原来的做法会出 bug（重构时不能再用）、怎么验证修好了（见 `user-spec/workflow.md`「工程规范」、`user-spec/decisions/README.md`）；
- 技术文档与代码注释说明设计依据时，引用对应的决策（全局 `D-NNNN`，应用 `GO-0001` 等）。
