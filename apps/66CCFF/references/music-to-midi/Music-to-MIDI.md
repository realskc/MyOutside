# Music-to-MIDI（mason369）

- 最近核对：2026-11-07
- 来源：[mason369/music-to-midi](https://github.com/mason369/music-to-midi)
- 类型：下游整合工具（不是模型官方仓库）

## 事实

- 项目提供 `SIX_STEM_SPLIT` 模式，使用 `BS-Rofo-SW-Fixed.ckpt` 生成 `bass / drums / guitar / piano / vocals / other` 六条 WAV。
- README 说明该模式依赖 `audio-separator==0.44.1` 和 BS-RoFormer SW Fixed 资源。
- 六条 WAV 可以分别选择 MIDI 路线，项目包含 YourMT3+、TransKun、ByteDance、MIROS、MuScriptor 等后端。
- 项目 README 的模型对比表里出现过：
  - `guitar 9.05 / piano 7.83 / other 8.71`
  - 文案将其归为「MVSEP 6-stem SDR 口径」，并强调这不是最终 MIDI F1。
- 这是**下游项目自己的引用/说明**，不是 BS-RoFormer SW 官方模型卡，也不是 MSST 官方跑分。

## 和纯蓝的关系

它证明 BS-RoFormer SW 已经被下游扒谱工具当作六轨分离底座使用；它的 README 是数字来源之一，不能把里面的数字当成官方基准。

## 待核实

- 这些 SDR 数字的原始评测条目和测试集；
- 六轨分离后的 MIDI 转换实际效果；
- 项目许可证与第三方权重的分发条件。
