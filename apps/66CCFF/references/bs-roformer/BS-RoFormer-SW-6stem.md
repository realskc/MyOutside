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

## 未核实 / 风险

- Gemini 给出的 SDR（guitar 9.05、piano 7.83；htdemucs_6s 5.22 / 2.23）我还没有找到原始 MVSEP 表格或模型卡出处，先不作为事实。
- 权重没有明确许可证；代码 MIT 不等于权重可分发，正式分发前必须确认。
- `audio-separator` 的模型列表里有 `BS-Roformer-SW.ckpt` / `BS-Roformer-SW.yaml` 条目，但没有确认它是否等同于 `BS-Rofo-SW-Fixed.ckpt`；Gemini 说的「audio-separator 已内置 Fixed 映射」需要本地验证。
- 699MB 权重 + PyTorch 的显存/耗时需要实测；GGUF/ONNX 是另一条部署路线。

## 与纯蓝的关系

目前最值得优先 A/B 的候选：如果它确实明显改善 guitar / piano，就可以直接从当前 `htdemucs_6s` 换成它，或者用它作为级联的 Stage 2。
