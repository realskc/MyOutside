# Basic Pitch

- 最近核对：2026-11-07
- 来源：[spotify/basic-pitch](https://github.com/spotify/basic-pitch)
- 许可证：Apache-2.0

## 是什么

Spotify 的轻量级音频转 MIDI 模型，支持复音、音高弯曲（pitch bend），乐器通用；官方说明「一次一个乐器效果最好」。

## 事实

- 当前纯蓝 MIDI 引擎使用 Basic Pitch 0.4.0，独立 Python 3.10 + ONNX Runtime 环境。
- Windows 上使用的 ONNX 模型约 230KB；按 ONNX 初始化器统计约 3.6 万个权重元素。
- 支持 `predict` / `predict_and_save` 和 CLI；输入音频会下混为单声道、重采样到 22050Hz。
- 我们的验证：
  - 3 分 02 秒的 piano stem → 1,131 个音符；
  - guitar stem → 880 个音符；
  - 两者混成一条音频 → 1,525 个音符，比分别转写少了约 486 个；
  - 冷启动约 20 秒，预热后约 5 秒。
- 结论：单轨效果好于混合音频；混合会损失部分音符。具体听感仍需试听。

## 和纯蓝的关系

当前已安装的 MIDI 引擎；适合吉他、贝斯、合成器等单条 stem 的快速转写。2026-11-07 作者反馈：分轨换上 BS-RoFormer SW 后效果明显改善，但 Basic Pitch 的 MIDI 转写仍然一般；当前保留，后续再评估专用钢琴 / 吉他模型或多轨转录方案。

## 待核实

- 与 ByteDance Piano Transcription / Transkun 等钢琴专用模型的对比；
- 对带混响、失真、分离伪影的吉他 stem 的实际听感；
- 阈值、最小音符长度等参数的最优组合。
