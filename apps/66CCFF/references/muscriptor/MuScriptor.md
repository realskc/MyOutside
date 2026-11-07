# MuScriptor

- 最近核对：2026-11-07
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

## 与纯蓝的关系

可作为「跳过音频分离，直接把 Instrumental / Other 转成多轨 MIDI」的候选。适合测试，但权重非商用，且需要 HuggingFace 登录和较大的 GPU。
