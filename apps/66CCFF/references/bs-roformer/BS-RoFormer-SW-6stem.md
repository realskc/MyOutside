# BS-RoFormer SW（6-stem，社区权重）

- 最近核对：2026-11-07
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

## SDR 数字的来源核查（2026-11-07）

- 权重模型卡没有评测数字；`enerjazzer` 的 README 只有一句「Edited version... allow use with UVR and MSST」。
- `guitar 9.05 / piano 7.83 / other 8.71` 出现在下游项目 [mason369/music-to-midi](https://github.com/mason369/music-to-midi) 的 README 里；该文档把口径归到「MVSEP Algorithms #77」，并注明这些是分离 SDR、不是最终 MIDI F1。它不是模型官方卡或 MSST 官方表。
- 另有 MVSEP Quality Checker 条目 #10847（2026-10 提交）的记录采用 **4 轨合并评测**：instrum 17.57、bass 14.56、drums 14.04、vocals 11.27、other（含 guitar + piano）8.66；没有单独列出 guitar / piano SDR。
- `htdemucs_6s` 的 `guitar 5.22 / piano 2.23` 不是 Demucs 官方基准。Demucs 官方 README 只说六源是实验性的、piano 有大量串音和伪影，并未给出这两个数字。
- 因此 `9.05 / 7.83` 只能作为「社区/下游引用」线索，不能写成官方 MVSEP 或 MSST 跑分；实际选型必须以本机 A/B 为准。

## 未核实 / 风险

- 权重没有明确许可证；代码 MIT 不等于权重可分发，正式分发前必须确认。
- `audio-separator` 的模型列表里有 `BS-Roformer-SW.ckpt` / `BS-Roformer-SW.yaml` 条目，但没有确认它是否等同于 `BS-Rofo-SW-Fixed.ckpt`；Gemini 说的「audio-separator 已内置 Fixed 映射」需要本地验证。
- 699MB 权重 + PyTorch 的显存/耗时需要实测；GGUF/ONNX 是另一条部署路线。

## 与纯蓝的关系

目前最值得优先 A/B 的候选：如果它确实明显改善 guitar / piano，就可以直接从当前 `htdemucs_6s` 换成它，或者用它作为级联的 Stage 2。
