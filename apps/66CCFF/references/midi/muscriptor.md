# MuScriptor

- 最近核对：2026-11-09
- 代码：[muscriptor/muscriptor](https://github.com/muscriptor/muscriptor)（MIT）
- 论文：[arXiv:2607.08168](https://arxiv.org/abs/2607.08168)（ISMIR 2026）
- 权重：[HuggingFace MuScriptor](https://huggingface.co/MuScriptor)（**CC BY-NC 4.0**）

## 是什么

Kyutai 与 Mirelo 的多乐器音乐转录模型：输入音频，输出 MIDI / 乐谱；不是音频分轨模型。

## 已核实的事实

- 代码 MIT；权重 CC BY-NC 4.0，**非商用**；使用前需要在 HuggingFace 接受模型许可并登录。
- 三个发布权重：
  - small：103M 参数，14 层；
  - medium：307M，24 层（默认）；
  - large：1.4B，48 层。
- 论文说明：
  - 使用 **170,000 首真实音乐录音（11,000 小时）** 带对齐音符标注的数据；
  - 合成数据约 **145 万 MIDI** 用于预训练；
  - 在 300 首高质量精标曲目上做 RL post-training，使用 **GRPO 类算法**；
  - 支持 **instrument presence conditioning**（告诉模型只关注哪些乐器）；
  - 输出 5 秒片段，16kHz mono 输入。
- CLI 支持自动检测 tempo、拍号、小节线，并写入 MIDI；`--quantize` 可对齐网格。
- `--format sheets` 可用 MuseScore 4+ 生成 MusicXML/PDF/分谱；MuseScore 需另装。
- Windows GPU 安装提示：`uvx --torch-backend=cu128 muscriptor serve`；默认 Windows PyTorch 是 CPU。

## 需要修正的说法

- “MIT 协议”只适用于代码；**权重不是 MIT**，是 CC BY-NC 4.0，不能直接商业分发。
- “目前综合最强 SOTA”是项目/论文的主张；论文在部分数据集上并非所有指标都超过 YourMT3+，不能当成无条件结论。
- 它做的是**转录**，不是把吉他/钢琴从混音中分离成 WAV。

## 本机验证（2026-11-08）

- 环境：`uvx` 安装的 `muscriptor 0.4.0`，medium 权重，RTX 5060 / CUDA；已登录 HuggingFace 并接受 CC BY-NC 4.0。
- 同一首 3 分 02 秒歌曲：
  - piano stem + `--instruments acoustic_piano`：986 个音符，1 轨，约 43 秒；
  - guitar stem + 三种吉他：881 个音符，2 轨（acoustic guitar / clean electric guitar），约 25 秒；
  - instrumental（不限制乐器）：2,668 个音符，4 轨（acoustic piano / drums / electric bass），约 80 秒。
- 作者试听：MuScriptor 的效果明显好于当前 Basic Pitch。
- 发现一个具体误判：00:23–00:25 的快速吉他音在 guitar 输出里属于 `clean electric guitar`；instrumental 输出没有单独的吉他轨，但同一串音被放进了 `acoustic piano` 轨。
- 用 `--instruments acoustic_guitar,clean_electric_guitar,distorted_electric_guitar` 重新转 instrumental 时，这串音被识别为 `acoustic guitar`，说明它确实是吉他；不限制乐器时是**标注错误**，不是“instrumental 里没有吉他”。
- 结论（作者听感，2026-11-08）：分轨转写和直接转 instrumental 的效果都非常好，目前没有明确证据表明直接转有明显缺陷；乐器标签误判本身不影响这个判断。更精细的对比等应用有钢琴卷帘显示功能后再做。

## 本机验证（Mac，2026-11-09）

- 环境：`muscriptor 0.4.0`（纯蓝的转 MIDI 引擎，Python 3.12 venv），medium 权重（1.23GB），Apple M4 Pro，Metal（MPS），PyTorch 2.15。
- 《白石溪》（5 分 34 秒），BS-RoFormer SW 分轨后：
  - vocals + `--instruments voice`：MIDI 里 538 个音符，1 轨（choir aahs），音高 47–97；用时 211 秒（含第一次下载权重）；检测到的 BPM 约 99；
  - bass + other + guitar + piano 混合 + `--instruments acoustic_piano`：MIDI 里 4,317 个音符，1 轨，音高 18–126（超出钢琴 21–108 的范围）；用时 142 秒；BPM 约 86；
  - 同样的混合、不限制乐器：11 轨（钢琴 2,647 个音符、音高 21–106；另有 bassoon 853 个、french horn、trumpet、弦乐、piccolo、贝斯、鼓等）；用时 115 秒。
- MuScriptor 的「音符开始」事件比最终 MIDI 里的音符多（上面两次分别是 652 / 13,625 个事件）：按 5 秒分块解码时，每块开头会重新声明上一块还在响的音符；数音符要以写出的 MIDI 为准。
- 同一首歌，人声和伴奏检测出的 BPM 不同（约 99 和 86），写进 MIDI 的都是跟着演奏走的 tempo map（上百个速度变化），没有拍号。

## 与纯蓝的关系

可作为「跳过音频分离，直接把 Instrumental / Other 转成多轨 MIDI」的候选。适合测试，但权重非商用，且需要 HuggingFace 登录和较大的 GPU。作者试听认为其质量明显优于 Basic Pitch；分轨转写和直接转 instrumental 两条路线都值得保留，当前不判定哪条更好，精细对比等钢琴卷帘显示功能后再做。
