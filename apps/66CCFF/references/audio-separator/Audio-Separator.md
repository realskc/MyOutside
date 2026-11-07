# Audio Separator

- 最近核对：2026-11-07
- 来源：[nomadkaraoke/python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator)
- 许可证：MIT（代码仓库标注）

## 是什么

一个 Python 包 / CLI，用 UVR 生态的预训练模型做音频分离。支持 MDX-Net、VR Arch、Demucs、MDXC / RoFormer 等模型族；模型按需下载。

## 事实

- 安装：`pip install "audio-separator[gpu]"`（GPU 版本）或 CPU 版本。
- 使用：CLI `audio-separator`，也可以 `from audio_separator.separator import Separator` 在 Python 中调用。
- 模型列表：`audio-separator --list_models`；支持按 stem 过滤，例如 `--list_filter=drums`。
- 输出：2 轨（Vocals / Instrumental）、4 轨和 6 轨模型；6 轨示例包括 Demucs 6s。
- 支持 ensemble：多个模型可用 `avg_wave`、`median_fft` 等算法组合，也有 preset。
- 平台：README 写 Windows、macOS、Linux；Windows CUDA 写的是 CUDA 11.8 / 12.2，DirectML 为实验性。
- 关键模型示例：`model_bs_roformer_ep_317_sdr_12.9755.ckpt` 是默认的 BS-RoFormer 人声 / 伴奏模型；模型列表里还有 Mel-Band RoFormer 的人声、去混响、去延迟等权重。
- 模型注册表里有 `BS-Roformer-SW.ckpt` / `BS-Roformer-SW.yaml` 条目，说明它支持 BS-RoFormer SW 系列；但 Gemini 说的 `BS-Rofo-SW-Fixed.ckpt` 固定版是否已内置，未确认。`openmirlab/bs-roformer-infer` 明确绑定固定版。

## 和纯蓝的关系

它是把 UVR 模型无 GUI 地接进后端的候选，适合做多模型实验和 ensemble；六轨优先测试 BS-RoFormer SW，其次才是 Demucs 6s。

## 待核实

- 当前机器 CUDA 12.8 / PyTorch 2.11 与该包声明的 CUDA 12.2 是否兼容；
- 6 轨模型的实际质量；
- 每个模型权重的许可证；
- 安装体积和首次模型下载大小。
