# 66CCFF-0013 引擎安装命令由后端按平台给出，页面里不写死

- 状态：有效
- 日期：2026-11-09
- 决策者：agent
- 服务于：
  - 作者预期：[`../README.md`](../README.md)「工具与平台」支持 Windows 和 macOS
  - 上游决策：[66CCFF-0003](66CCFF-0003-engine-setup-script.md)（仓库脚本安装，应用检测状态）、[66CCFF-0009](66CCFF-0009-macos-source-install.md)（macOS 源码安装）

## 决策

- 分离引擎和转 MIDI 引擎的「未安装」提示，都显示后端 `getEngineStatus` / `getTranscriptionEngineStatus` 返回的 `setupCommand`；页面（`ui/index.html`）里不再写任何平台的命令。

## 什么时候应该重新考虑

- 随时可以：例如以后在应用里直接提供安装按钮，就不再需要显示命令。

## 修复的 bug

- **现象**（agent 在 Mac 上看纯蓝截图时发现，2026-11-09）：在 Mac 上，分离面板的「未检测到分离引擎」提示显示的是 Windows 的 `powershell … setup-engine.ps1`，照着运行不了。
- **原因**：命令直接写死在 `ui/index.html` 里，是 66CCFF-0009 加 macOS 支持之前留下的；后端早就按平台返回了正确的 `setupCommand`，页面没有用它。
- **为什么原来的做法会出 bug（重构时不能再用）**：不能在页面里写死跟平台有关的命令或路径；这类内容一律由后端按当前平台给出。
- **怎么验证修好了**：冒烟测试 `[smoke] 66CCFF separation help`：检查提示里的命令和当前平台一致（macOS 上是 `setup-engine-macos.sh`，Windows 上是 `setup-engine.ps1`）。
