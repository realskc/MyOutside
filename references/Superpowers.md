# Superpowers

> 最近一次核对：2026-11-11（看的是 GitHub 仓库 README 和几个 SKILL.md 的当前版本）。

[obra/superpowers](https://github.com/obra/superpowers)：一套给编码 agent 用的 skill 库，自称「An agentic skills framework & software development methodology that works」。支持 Claude Code（官方插件市场）、Codex 等；MIT 许可。

## 它的工作流（README）

1. **brainstorming**：动手之前先把意图问出来；小改动在对话里定，项目要写一份「建造者不用回头问作者就能据此制定计划」的设计文档，作者批准后才进入下一步（skill 里有 HARD-GATE：批准前不许写代码、搭脚手架）。
2. **using-git-worktrees**：设计批准后开独立的分支和工作区。
3. **writing-plans**：把工作拆成 2–5 分钟的小任务，每个任务写明确切的文件路径、完整代码、验证步骤；计划存到 `docs/superpowers/plans/`。
4. **subagent-driven-development** 或 **executing-plans**：每个任务派一个新的子 agent 去做、做完审查；或者在当前会话里一口气做完、最后审查一次。subagent-driven-development 写明「Continuous execution：任务之间不要停下来问作者，把计划里的任务全部做完」，只有几种情况才停。
5. **test-driven-development**：强制「先写失败的测试，再写最少的代码让它通过」，删掉测试之前写的代码。
6. **requesting-code-review**：任务之间按计划审查，严重问题阻止继续。

另有 systematic-debugging、verification-before-completion 等。

## using-superpowers

一个总入口 skill，description 是「Use when starting any conversation」：只要有 1% 的可能某个 skill 适用，就必须在任何回应（包括提问）之前先调用它，并「follow the skill exactly」。作者的指令（CLAUDE.md、AGENTS.md、直接要求）优先于 skill。

## 来源

- [README](https://github.com/obra/superpowers/blob/main/README.md)
- [brainstorming/SKILL.md](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md)
- [subagent-driven-development/SKILL.md](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md)
- [using-superpowers/SKILL.md](https://github.com/obra/superpowers/blob/main/skills/using-superpowers/SKILL.md)
