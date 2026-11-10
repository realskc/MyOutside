# noteDigger

- 最近核对：2026-11-10
- 网址：[madderscientist.github.io/noteDigger](https://madderscientist.github.io/noteDigger/)；代码：[madderscientist/noteDigger](https://github.com/madderscientist/noteDigger)（GPL-3.0，约 360 星）
- 作者 madderscientist 也是 [timbreAMT](../separation/timbreamt.md) 的作者（timbreAMT 是他的毕设）

## 是什么

**网页上的辅助人工扒谱工具**，模仿桌面软件 WaveTone。纯前端，不用框架和外部库，打开网页就能用；中文界面。

## 已核实的事实（README）

- 导入音频（mp3、wav，也可以是 mp4 等视频）后显示**频谱图**（STFT，后台再算 CQT），左边是琴键；在频谱上**直接画 MIDI 音符**，对着频谱扒。
- 多音轨，每轨可以锁定、隐藏、静音；原曲和 MIDI 同步播放，可以互换两者的音量；时间轴上拖出循环区间。
- 「分析」里有：节奏分析（自动检测节拍，再手动修小节线）、去除谐波（用谐波模板拟合频谱、增强基频）、调性分析、和弦识别；「人工智障扒谱」用 timbreAMT 的模型自动转一遍，转出的音轨锁定后当参考，再在新轨上「描」。
- 节拍吸附：按小节线和自动细分线吸附画音符；导出 MIDI 时可以按小节线量化，直接用于制谱。
- 「数字谱对齐音频」：输入单声部简谱，自动对齐成和音频同步的 MIDI。
- 撤销 / 重做、复制粘贴、框选；导出 `.nd` 工程文件，下次继续。
- 作者自己说：频谱阈值自动填充「效果不堪入目」，AI 扒谱「效果非常初级」，主要靠人工后处理。

## 和纯蓝的关系

纯蓝的定位是扒谱和音乐学习工作台，这是同类工具里很具体的一个：频谱 + 卷帘 + 人工画音符 + 自动转写当参考。作者打算去试（2026-11-10）。
