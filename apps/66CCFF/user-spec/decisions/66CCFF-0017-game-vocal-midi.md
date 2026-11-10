# 66CCFF-0017 人声旋律转 MIDI 用 GAME；转 MIDI 的节拍都在整首歌上检测

- 状态：有效
- 日期：2026-11-10
- 决策者：agent（作者听了试验结果，觉得 GAME 转得不错、基本可用；接进应用的方式由 agent 设计；节拍用原曲来测，作者确认没问题）
- 服务于：
  - 作者预期：[`../README.md`](../README.md)「功能」里的 MIDI 转写；作者觉得 MuScriptor 转人声效果不理想、要找更厉害的人声转 MIDI 模型（[MuScriptor 想法](../../references/midi/muscriptor-thoughts.md)）；作者听了 GAME 的结果觉得基本可用（[GAME 想法](../../references/midi/game-thoughts.md)）
  - 上游决策：[66CCFF-0012](66CCFF-0012-muscriptor-in-app-transcription.md)（MuScriptor 转写）、[66CCFF-0015](66CCFF-0015-roll-on-player-timeline.md)（卷帘的小节线）、[66CCFF-0016](66CCFF-0016-midi-bar-offset.md)（MuScriptor 的小节对齐延后）

## 背景

- MuScriptor 转人声，作者听了有很多错音。它会转出高八度以上的音，还会把音叠在一起，可人声是单旋律。
- 2026-11-10 在临时目录里试了 GAME（openvpi，SOME 的下一代，专门转人声）的 large 权重。《白石溪》人声 82 秒转完，没有叠音，音域合理。作者听了觉得转得不错，基本可用。试验记录见 [GAME 参考](../../references/midi/game.md)。
- 以前 MuScriptor 在**所转的那条音频**上检测节拍。同一首歌，人声和伴奏检测出的速度不同（约 99 和 86 BPM），卷帘里叠在一起时小节线只能对上一个（66CCFF-0015「代价」）。

## 决策

### GAME 作为第二个转写引擎，只转人声旋律

- 引擎目录 `<userData>/apps/66CCFF/game-engine`：
  - `venv`：Python 3.12，PyTorch、GAME 的依赖、beat_this；
  - `GAME/`：GAME v1.0.3 的代码（MIT）；
  - `models/GAME-1.0-large/`：权重，约 350MB，CC BY-NC-SA 4.0，非商用。
- 安装：`scripts/setup-game-macos.sh`（macOS，MPS）和 `scripts/setup-game.ps1`（Windows，CUDA PyTorch）。装过的代码和权重会跳过，权重下载断了重跑会接着下。不用登录。
- 应用调用 `scripts/transcribe_game.py`。脚本在进程里走 GAME 的 `extract` 流程（参数和 `infer.py extract` 的默认一样，语言 `zh`），结果收进内存，按切片打印进度。进度行的格式和 MuScriptor 的包装脚本一样。
  - 一批只放一段：一首歌常常只切成几段（《白石溪》3 段），一批四段时进度只会从 0 一下跳到 100%。速度没受影响：《白石溪》一段一批 36 秒；之前一批四段跑了 82–91 秒，但没有做严格对照。
- 音高四舍五入成整数（GAME 给的是带音分的浮点音高）；轨名 `Vocals (GAME)`，音色 choir aahs（GM 52），和 MuScriptor 的 voice 一样。
- 记录：`transcription` 表不加列，GAME 的 `model` 写 `game-large`（MuScriptor 仍是 `medium`），引擎从 model 看出来，接口返回 `engine: "muscriptor" | "game"`。`instrument` 固定为 `voice`，传别的乐器拒绝。
- 接口：`startTranscription` 多一个 `engine`（默认 `muscriptor`）；`getTranscriptionEngineStatus` 多一个 `game { ready, engineDir, setupCommand, message }`。
- 界面：「转成」列表最前面是「人声旋律（GAME）」。**只勾人声时默认选它**；MuScriptor 的人声改名「人声（MuScriptor）」，还能选来对比。「转 MIDI」按钮和安装提示跟着所选的引擎走。结果列表和卷帘里，GAME 的结果叫「人声旋律（GAME）← 人声」。

### 节拍都在整首歌上检测

- 纯蓝先用 ffmpeg 把曲目的原始音频解成 16kHz 单声道 WAV（m4a、aac 这些格式 Python 那边不一定读得了），再传给两个包装脚本（`--beats-audio`）。MuScriptor 在它上面检测节拍；GAME 的脚本用同一个 beat_this 模型（`final0`）检测。同一首歌的每次转写因此用同一套拍：《白石溪》上两边都是 86.003 BPM、恒定速度、第一个强拍 2.88 秒（MuScriptor 以前在人声上检测，是约 99 BPM、不恒定）。
- GAME 的 MIDI 照 MuScriptor 的写法：
  - 拍子拟合成直线后，残差小于一拍的 5% 就写恒定速度，否则每拍一个速度；
  - 音符整体延后，让强拍落在小节线上，并写 `muscriptor:bar_offset` marker（纯蓝读时减回去，66CCFF-0016）；
  - 九成小节同意才写拍号，否则不写（卷帘按 4/4）。
  这部分改写自 MuScriptor 0.4.0 的 `utils/beats.py`（MIT）。
- 强拍位置用**多数票**：取 beat_this 检测出的所有强拍里，落在「第几拍（按小节取余）」最多的那种。MuScriptor 自己用的是第一个强拍。《白石溪》全曲 135 个强拍里，81 个落在同一种位置，正是第一个强拍（2.88 秒）；所以这首歌上两边一致。
- 检测不出节拍（太短或不到 8 拍）时，GAME 的 MIDI 用 120 BPM、不延后。

## 考虑过、没有采用

- **用 GAME 替换 MuScriptor 的人声**：MuScriptor 还要转别的乐器；人声两边都留着，方便对比，默认用 GAME。
- **加一列 `engine`**：内核的迁移只有建表和建索引，加列要先改内核；从 model 就能看出引擎，暂时够用。
- **调用 `infer.py extract` 再读它写的 CSV**：拿不到进度；在进程里调它的接口，结果直接收进内存。
- **GAME 的 MIDI 不延后，用一个很快的速度把弱起塞进第一小节**：MIDI 时间就等于音频时间，但 DAW 里开头会有一段奇怪的速度。和 MuScriptor 用同一个约定更简单，纯蓝读的时候统一减回去。
- **用 beat_this 检测出的第一个强拍**：beat_this 偶尔多报一个强拍，整首的小节线就错一拍。
- **在伴奏或所转的那条 stem 上检测节拍**：同一首歌各次转写的小节线对不上。在《白石溪》上，MuScriptor 在伴奏（没有鼓）上检测出的小节，和在整首歌上检测出的差了一拍。

## 代价

- GAME 的权重非商用（CC BY-NC-SA 4.0），和 MuScriptor 一样；产品化时要重新考虑。
- 多一个约 1GB 的引擎目录（venv + 权重）。
- 只转单旋律：两人同时唱的地方只会出一条（作者希望合唱分成各自的轨，见应用 spec；UNMIXX 的试验没有分开，见 [UNMIXX 想法](../../references/separation/unmixx-thoughts.md)）。
- 语言固定 `zh`；日语、英语、粤语的歌分段可能差一些。
- GAME 的采样不完全确定：同一条人声，几次运行的音符数略有不同（《白石溪》369–377 个）。
- 两个引擎找强拍的办法不一样（多数票 / 第一个强拍），少数歌上两边的小节线可能差一拍。
- 以前在所转的 stem 上检测的结果不重转；它们的小节线还是旧的。
- Windows 的安装脚本还没实测。

## 什么时候应该重新考虑

- 作者觉得 GAME 的结果不够好，或者有了更好的人声转 MIDI 模型；
- 要转日语等其他语言的歌（加语言选项）；
- 合唱能分成各自一条以后（每条各转一次）；
- 要产品化（权重许可）。

## 怎么验证

- 单测「转 MIDI（GAME）：只转人声、不用登录 HuggingFace，节拍也在整首歌上检测」：假 GAME 引擎收到 `--engine` 和整首歌的 `--beats-audio`；记录是 `engine: game`、`model: game-large`；乐器不是 voice 时拒绝。MuScriptor 的单测也检查收到了 `--beats-audio`。
- 冒烟 `66CCFF game choice`：只勾人声时「转成」默认选 GAME；冒烟数据里没装 GAME，应显示 GAME 的安装命令、按钮不可点。
- 2026-11-10 在 Mac 上：用 `setup-game-macos.sh` 装好引擎（权重从试验目录拷来）。在一份临时数据（白石溪的原曲和人声，内存数据库）上跑真正的 `startTranscription`：36 秒，369 个音符，第一个音在原音频 47.48 秒，小节线在 2.878 秒（检测到的强拍）上。
