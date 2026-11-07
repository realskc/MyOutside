# mt3-infer

- 最近核对：2026-11-07
- 代码：[openmirlab/mt3-infer](https://github.com/openmirlab/mt3-infer)
- 许可证：仓库/PyPI 标注 MIT；GitHub API 显示 NOASSERTION，需以 LICENSE 文件为准

## 是什么

MT3 家族的生产级统一推理封装，提供 `transcribe()` / `load_model()` 等接口。

## 已核实的事实

- 支持三个后端：
  - MR-MT3（约 176MB）
  - MT3-PyTorch（约 176MB）
  - YourMT3（约 536MB，默认 `YPTF.MoE+Multi (noPS)`）
- **不包含 MuScriptor**；也不包含 Magenta 原版 JAX/Flax MT3。
- 包本体约 8MB，权重首次调用自动下载并缓存。
- 当前 README 说明 PyPI 不再发布新版本，安装方式是：
  ```bash
  pip install "mt3-infer @ git+https://github.com/openmirlab/mt3-infer.git"
  ```
- MT3-PyTorch 后端提供 `auto_filter`，用于修正鼓轨的 instrument leakage；不是对所有模型/所有乐器通用的串轨过滤。
- YourMT3 后端的权重来自 `mimbres/YourMT3`（HF 标 Apache-2.0，GitHub 仓库标 GPL-3.0，许可证存在不一致）。
- MT3-PyTorch 上游 `kunato/mt3-pytorch` 没有声明许可证；mt3-infer 原样 vendor，分发时需要注意。

## 与纯蓝的关系

如果要把 `Instrumental` / `Other` 直接转成多轨 MIDI，它比分别安装三个研究仓库更省事；但许可证和模型效果要逐项核对。

## 待核实

- Windows / 当前 CUDA 环境的安装；
- YourMT3 和 MR-MT3 的实际输出乐器类别；
- 转录质量、显存和速度；
- 各后端许可证对应用分发的影响。
