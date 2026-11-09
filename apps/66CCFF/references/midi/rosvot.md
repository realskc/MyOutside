# ROSVOT（Robust Singing Voice Transcription）

- 最近核对：2026-11-10
- 代码：[RickyL-2000/ROSVOT](https://github.com/RickyL-2000/ROSVOT)（许可证未核对）；论文：[arXiv:2405.09940](https://arxiv.org/abs/2405.09940)（ACL 2024）；主页：[rosvot.github.io](https://rosvot.github.io/)

## 是什么

**人声转 MIDI**模型，面向给歌声合成（SVS）做数据标注：把歌声转成音符序列。

## 已核实的事实

- 论文称在干净和带噪输入上都达到当时最好的转写准确率；音高转写比之前最好的方法相对提升 17%，带噪输入时 23%（论文）。
- 能处理带噪声或带伴奏的人声；给了字边界时，输出音符会对齐到字（README）。
- 提供的权重只用 M4Singer（普通话）训练；作者说在其他语言上经验上也不错（README）。
- 权重包里还有字边界预测（RWBD）和音高提取（RMVPE）模型（README）。
- 只处理单旋律。
