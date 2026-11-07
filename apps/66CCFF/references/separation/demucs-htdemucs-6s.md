# HTDemucs 6-stem（htdemucs_6s）

- 最近核对：2026-11-07
- 来源：[facebookresearch/demucs](https://github.com/facebookresearch/demucs)（原仓库不再维护；作者 fork：[adefossez/demucs](https://github.com/adefossez/demucs)）
- 许可证：MIT

## 是什么

Demucs v4 的六源实验模型，输出 `drums / bass / other / vocals / guitar / piano`；曾作为纯蓝的首版分离引擎，现已弃用。

## 官方事实

- Demucs README 明确称六源模型为 **experimental**：
  - guitar 初步测试「看起来还可以」；
  - piano 存在大量串音（bleeding）和伪影（artifacts）。
- 官方主模型是 4 源（drums / bass / other / vocals），标准 MUSDB 评测也是 4 源；官方没有发布六源的 MUSDB 六轨 SDR 基准。
- 因此网上常见的 `guitar 5.22 / piano 2.23` 这类数字，没有 Demucs 官方 README 或标准评测表出处，不能当作官方基准。

## 和纯蓝的关系

曾经是基线。它的吉他轨可用但钢琴轨质量弱，是作者换模型的主要原因之一；2026-11-07 作者试听 BS-RoFormer SW 后确认旧模型可以弃用（见 [66CCFF-0008](../../user-spec/decisions/66CCFF-0008-bs-roformer-engine.md)）。

## 与 BS-RoFormer SW 的对比

- 2026-11-07 作者实际试听：BS-RoFormer SW 的六轨效果明显更好；旧模型不再作为应用引擎。
- 耗时、显存等工程数据仍可在后续同类歌曲上积累。
