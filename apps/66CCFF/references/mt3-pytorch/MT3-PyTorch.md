# MT3-PyTorch

- 最近核对：2026-11-07
- 代码：[kunato/mt3-pytorch](https://github.com/kunato/mt3-pytorch)
- 许可证：上游没有声明（待核实）

## 是什么

社区对 Google Magenta MT3 的 PyTorch 移植/实现，不是 Magenta 官方 JAX/T5X 原版。

## 已核实的事实

- 仓库存在；约 176MB 权重，可通过 `mt3-infer` 调用。
- `mt3-infer` 的 MT3-PyTorch 后端带 `auto_filter`，主要修正鼓轨的 instrument leakage。
- 上游仓库没有许可证声明；`mt3-infer` 原样 vendor 该代码。
- Magenta 官方 MT3 是 Apache-2.0，但官方 JAX/Flax 实现没有被 `mt3-infer` 封装。

## 与纯蓝的关系

这是 MT3 家族的兼容/旧路线，优先级低于 MuScriptor 和 YourMT3+；许可证也需要先确认。

## 待核实

- 输出质量；
- `auto_filter` 的实际作用范围；
- 许可证和分发条件。
