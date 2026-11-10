# timbreAMT（音色分离转录：直接出多条 MIDI）

- 最近核对：2026-11-10
- 论文：Ruigang Li、Yongxu Zhu，*A Lightweight Two-Branch Architecture for Multi-Instrument Transcription via Note-Level Contrastive Clustering*（TISMIR 2026，[doi:10.5334/tismir.300](https://doi.org/10.5334/tismir.300)，CC BY 4.0）
- 代码与模型：[madderscientist/timbreAMT](https://github.com/madderscientist/timbreAMT)（Apache-2.0；仓库约 225MB，ONNX 模型在 `septimbre/septimbre_44100.onnx`，约 670KB）
- 网页工具：作者把它接进了自己做的扒谱网页 [noteDigger](https://madderscientist.github.io/noteDigger/)（辅助人工扒谱；纯蓝的定位也是扒谱工作台，可以留意）

## 是什么

**不分离音频，直接按音色出几条 MIDI**：一个分支做和音色无关的复音转录（在 BasicPitch 基础上改的），另一个分支给每个时频点算 12 维的音色编码；先转出所有音符，再把每个音符的编码平均后做谱聚类（要指定几类）。

## 已核实的事实（论文）

- 「音色」指乐器类别（小提琴、长笛……），不是具体的某个人；用 MusicNet（古典器乐）训练。
- 处理不了「两个声源同时奏同一个音」（论文自己说没解决），也就是齐唱。
- 两三种乐器混在一起时，分对的比例 70% 以上（BACH10 / URMP）；模型很小，能在浏览器里跑。

## 本机验证（Mac，2026-11-10）

- onnxruntime 跑 ONNX 模型，《白石溪》人声分轨 5 分 34 秒，加聚类共约 40 秒（CPU）。阈值用仓库 notebook 里的（frame 0.32、onset 0.4），分两类。
- 转出 633 个音（GAME 是 373 个）；独唱段 13–15% 的时间有两个以上的音，多是错音。
- **两类不是两个人**：按萌娘百科颜色的参考答案，独唱时间按最好的对应只有 54% 分对（瞎猜是 50%）。其中一类大多落在两人一起唱的副歌里，像是分出了「合唱 / 独唱」，而不是「天依 / 阿绫」。
- 结果：`~/Downloads/白石溪 MIDI/白石溪-人声分两人-timbreAMT.mid`（两轨，按秒写，120 BPM，没有和纯蓝的小节线对齐）。
- 结论：现成的模型分不了同类的两个人声；要用的话得拿歌声数据重新训练音色分支。
