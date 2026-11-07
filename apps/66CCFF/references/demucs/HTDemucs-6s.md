# HTDemucs 6-stem（htdemucs_6s）

- 最近核对：2026-11-07
- 来源：[facebookresearch/demucs](https://github.com/facebookresearch/demucs)（原仓库不再维护；作者 fork：[adefossez/demucs](https://github.com/adefossez/demucs)）
- 许可证：MIT

## 是什么

Demucs v4 的六源实验模型，输出 `drums / bass / other / vocals / guitar / piano`；当前纯蓝分离引擎使用的就是它。

## 官方事实

- Demucs README 明确称六源模型为 **experimental**：
  - guitar 初步测试「看起来还可以」；
  - piano 存在大量串音（bleeding）和伪影（artifacts）。
- 官方主模型是 4 源（drums / bass / other / vocals），标准 MUSDB 评测也是 4 源；官方没有发布六源的 MUSDB 六轨 SDR 基准。
- 因此网上常见的 `guitar 5.22 / piano 2.23` 这类数字，没有 Demucs 官方 README 或标准评测表出处，不能当作官方基准。

## 和纯蓝的关系

当前基线。它的吉他轨可用但钢琴轨质量弱，是作者想换模型的主要原因之一。

## 待核实

- 与 BS-RoFormer SW 六轨在同一批歌曲上的听感、耗时、显存对比；
- 六轨输出是否满足纯蓝的钢琴练习需求。
