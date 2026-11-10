# 66CCFF-0016 读 MIDI 时去掉 MuScriptor 为对齐小节线加的延后（修复卷帘里 MuScriptor 的音比分轨晚）

- 状态：有效
- 日期：2026-11-10
- 决策者：agent
- 服务于：
  - 作者预期：[`../README.md`](../README.md)「界面」里钢琴卷帘的几条（作者把卷帘当谱看，要和分轨一起听）
  - 上游决策：[66CCFF-0012](66CCFF-0012-muscriptor-in-app-transcription.md)（MuScriptor 转写）、[66CCFF-0015](66CCFF-0015-roll-on-player-timeline.md)（卷帘和分轨共用一条时间线）

## 背景

MuScriptor 写 MIDI 时会检测节拍，把小节线写进去。MIDI 没有弱起小节：第 1 小节总是从 tick 0 开始。为了让第一个强拍落在小节线上，MuScriptor 把**所有音符往后推**一段时间，并在第一轨记一个 marker：`muscriptor:bar_offset=<秒>`。按它的说明，这个数是「原音频从 MIDI 的这个时间开始」。

## 修复的 bug

- **现象**：卷帘和 MIDI 合成器里，MuScriptor 转出来的音符比分轨晚几百毫秒，拍线和小节线也一起晚。《白石溪》里人声晚 0.40 秒，伴奏晚 0.64 秒。（作者之前把这些 MIDI 拖进 GarageBand 和音频一起看时，也一样晚。）
- **原因**：纯蓝读 MIDI 时把 MIDI 的秒直接当成原音频的秒，没有看这个 marker。
- **为什么原来的做法会出 bug**：MuScriptor 的 MIDI 时间 = 原音频时间 + bar_offset，两者不是一回事。凡是要把 MIDI 和音频对齐的地方（卷帘、合成器，以后的任何对照功能）都必须先减掉它。**重构时不能把 MIDI 的秒直接当原音频的秒。**
- **怎么验证修好了**：
  - 单测「readMidi 去掉 MuScriptor 为对齐小节线加的延后」：一个带 `bar_offset=0.4` 的 MIDI，读出来的音符、时长、拍和小节线都早 0.4 秒。修之前这项失败（读出 1.4 秒），修之后通过；
  - 真实数据：拿不做延后的 GAME 人声结果，对照 MuScriptor 的人声结果。在同一时间有同音高 MuScriptor 音符的 GAME 音符，修之前 373 个里 277 个，减掉 0.3986 秒后是 366 个。

## 决策

- 后端解析 MIDI（`readMidi`、`readTranscription` 共用）时，找第一轨里的 `muscriptor:bar_offset=` marker。找到就从音符时间、拍和小节线、总时长里减掉这个数。读出来的时间一律是**原音频的时间**。
- 拍和小节线可以是负数：那是第一个强拍前面那段不完整的小节。
- 手动添加的 MIDI 文件也一样处理：MuScriptor 命令行写的文件同样带这个 marker。
- 纯蓝自己生成、要和 MuScriptor 共用小节线的 MIDI，也按这个约定写（音符延后 + 同样的 marker）。例如 2026-11-10 给作者的 `白石溪-人声-GAME.mid`。

## 考虑过、没有采用

- **转写时就写不延后的 MIDI**：小节线就落不到强拍上了（MIDI 没有弱起），在 DAW 里看小节也是错的。
- **在界面里减**：后端是唯一解析 MIDI 的地方，在这里减，卷帘、合成器和以后的功能拿到的都是同一套时间。

## 代价

- 只认 MuScriptor 的这个 marker；别的软件用别的办法对齐小节线时，还是按 MIDI 时间显示。

## 什么时候应该重新考虑

- MuScriptor 改了 marker 的写法或含义；
- 接进别的会做类似延后的转写工具。
