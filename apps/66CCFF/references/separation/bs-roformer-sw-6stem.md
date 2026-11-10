# BS-RoFormer SW（6-stem，社区权重）

- 最近核对：2026-11-08
- 权重镜像：[enerjazzer/BS-ROFO-SW-Fixed](https://huggingface.co/enerjazzer/BS-ROFO-SW-Fixed)、[FractalSurfer/BS-RoFormer-SW-6stem](https://huggingface.co/FractalSurfer/BS-RoFormer-SW-6stem)
- 代码/推理：[openmirlab/bs-roformer-infer](https://github.com/openmirlab/bs-roformer-infer)（MIT）
- 浏览器版本：[elicwhite/bs-roformer-web](https://github.com/elicwhite/bs-roformer-web)（MIT）
- 权重许可证：**unknown / 未声明**（HF 模型卡标注 `license: unknown`）

## 是什么

社区版 BS-RoFormer SW 六轨模型，输出顺序：

```text
bass, drums, other, vocals, guitar, piano
```

它不在 ZFTurbo/MSST 的官方预训练表里，但使用 MSST 的 BS-RoFormer 架构和配置；可以作为独立权重接入 MSST / bs-roformer-infer。

## 已核实的事实

- `enerjazzer` 镜像提供：
  - `BS-Rofo-SW-Fixed.ckpt`：699,412,152 B
  - `BS-Rofo-SW-Fixed.yaml`：4,613 B
  - SHA256 在镜像 README 中列出
- `FractalSurfer` 镜像提供 `.ckpt` / `.yaml` 的字节级镜像，以及 `BS-RoFormer-SW-6stem-q8_0.gguf`（188,130,912 B）。
- `bs-roformer-infer` 的模型注册表把 `roformer-model-bs-roformer-sw-by-jarredou` 设为默认模型之一，指向 `enerjazzer` 的固定版，并带 SHA256 校验；支持 CPU / CUDA。
- `bs-roformer-infer` 当前通过 git 安装，不在 PyPI 发布新版本。
- `elicwhite/bs-roformer-web` 提供浏览器 ONNX 版本：fp16 约 336MB、fp32 约 669MB，使用 WebGPU。
- 原 `jarredou` Hugging Face 账号已删除；当前镜像用于恢复可下载性。
- `FractalSurfer` 镜像的 License 段明确写：上游声明 **no license**（`license: unknown`），这个镜像不授予额外权利，使用条款需要联系原作者。未声明许可证不等于公共领域。

## SDR 数字的来源核查（2026-11-07）

- 权重模型卡没有评测数字；`enerjazzer` 的 README 只有一句「Edited version... allow use with UVR and MSST」。
- `guitar 9.05 / piano 7.83 / other 8.71` 出现在下游项目 [mason369/music-to-midi](https://github.com/mason369/music-to-midi) 的 README 里；该文档把口径归到「MVSEP Algorithms #77」，并注明这些是分离 SDR、不是最终 MIDI F1。它不是模型官方卡或 MSST 官方表。
- 另有 MVSEP Quality Checker 条目 #10847（2026-10 提交）的记录采用 **4 轨合并评测**：instrum 17.57、bass 14.56、drums 14.04、vocals 11.27、other（含 guitar + piano）8.66；没有单独列出 guitar / piano SDR。
- `htdemucs_6s` 的 `guitar 5.22 / piano 2.23` 不是 Demucs 官方基准。Demucs 官方 README 只说六源是实验性的、piano 有大量串音和伪影，并未给出这两个数字。
- 因此 `9.05 / 7.83` 只能作为「社区/下游引用」线索，不能写成官方 MVSEP 或 MSST 跑分；实际选型必须以本机 A/B 为准。

## 未核实 / 风险

- 权重没有明确许可证；代码 MIT 不等于权重可分发，正式分发或商业使用前必须联系权利人确认。
- `audio-separator` 的模型列表里有 `BS-Roformer-SW.ckpt` / `BS-Roformer-SW.yaml` 条目，但没有确认它是否等同于 `BS-Rofo-SW-Fixed.ckpt`；Gemini 说的「audio-separator 已内置 Fixed 映射」需要本地验证。
- 699MB 权重 + PyTorch 的显存/耗时需要实测；GGUF/ONNX 是另一条部署路线。

## 本机验证（2026-11-07）

- 测试曲目：现有 3 分 02 秒歌曲，44.1kHz 立体声。
- 环境：独立 `roformer-engine` venv（约 59MB），通过 `.pth` 借用旧 Demucs 引擎的 PyTorch 2.11 / CUDA 12.8；这是测试环境，正式的安装脚本会安装独立的 CUDA PyTorch。
- 模型：`BS-Rofo-SW-Fixed.ckpt` 约 667MB；`bs-roformer-infer` 0.1.6（git 安装）。
- 推理：RTX 5060，约 **36 秒**；首次运行包含模型下载时总共约 108 秒。
- 输出：六条 FLAC（bass / drums / other / vocals / guitar / piano）+ 派生 instrumental；所有文件均为 183.537 秒。
- 六条 stem 相加相对原曲的残差约 **-33.3 dB**；各轨 RMS 非零，说明不是空文件。
- Basic Pitch 测试（只转写，不播放）：
  - guitar：771 个音符；旧 htdemucs_6s guitar 为 880 个；
  - piano：1,436 个音符；旧 htdemucs_6s piano 为 1,131 个。
  - 当时只记录数量，不能据此判断哪边更好；后续作者试听后确认新引擎的六轨效果明显更好。

## 与纯蓝的关系

2026-11-07 作者试听：六轨效果明显好于旧 `htdemucs_6s`，旧的六轨模型可以弃用；已选为纯蓝的分离引擎（见 [66CCFF-0008](../../user-spec/decisions/66CCFF-0008-bs-roformer-engine.md)）。正式安装脚本会创建独立的 `roformer-engine` 环境：Windows CUDA，macOS CPU。

## 结构（2026-11-10 读本机代码和权重核对）

- 代码：`bs_roformer/bs_roformer.py`（`BSRoformer`）；配置 `BS-Rofo-SW-Fixed.yaml`：`dim 256`、`depth 12`（每层一个沿时间的 Transformer + 一个沿频带的 Transformer）、8 头注意力；STFT 窗 2048、步长 512（1025 个频点）；推理一块 588800 个采样（13.35 秒），相邻块重叠一半。
- 每一路一个「遮罩估计器」（`mask_estimators`，顺序 bass、drums、other、vocals、guitar、piano，人声是第 3 个，从 0 数）：每个频带一个小 MLP（扩展 4 倍、2 层、GLU），输出**复数遮罩**，和混合的频谱做复数乘法（`stft_repr * mask`），不限制在 0–1。
- 切频带：62 个频带，第一个只含 2 个频点（约 43Hz 宽），最后一个含 129 个（约 2.8kHz 宽）；每个频带每一帧（左右声道的实部、虚部一起）经一个线性层变成 256 维向量。一块 13.35 秒是 1151 帧，主体末端的激活是 **1151 × 62 × 256**（帧 × 频带 × 特征）。
- 主体每个 Transformer：q、k、v 各 256→512（8 头 × 64），输出 512→256，前馈 256→1024→256，约 105 万参数；12 层 × 2（沿时间、沿频带）= 24 个。参数小是因为它在所有帧、所有频带上**共用**同一套权重。
- 遮罩估计器的每个频带各有一个 MLP（256→1024→该频带的输出），62 个不共用，所以每个头有 24.7M：第一层 62 × 26.3 万 ≈ 16.3M，输出层合计约 8.4M。
- 参数共 174.7M：12 层 Transformer 主体只有 25.3M（14.5%），**每个遮罩估计器 24.7M（14.2%），六个占 85%**；频带切分 1.1M。
