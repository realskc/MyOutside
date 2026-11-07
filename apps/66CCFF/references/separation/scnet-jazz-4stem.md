# SCNet Jazz 4-stem（JorisVaneyghen 权重）

- 最近核对：2026-11-07
- 权重镜像：[noblebarkrr/mvsepless_resources](https://huggingface.co/noblebarkrr/mvsepless_resources)
- 文件：
  - `scnet/scnet_xl_jazz_4stem_jorisvaneyghen.ckpt`（约 216MB）
  - `scnet/scnet_xl_jazz_4stem_jorisvaneyghen_config.yaml`
- 许可证：模型卡/镜像未注明（待核实）

## 已核实的事实

- 权重确实存在于 `noblebarkrr/mvsepless_resources`。
- 配置中的输出 sources 是：
  ```text
  drums, bass, piano, other
  ```
- 基于 SCNet-XL 架构；配置没有 vocals 轨，适合在已经去掉人声的伴奏上提取钢琴。

## 与纯蓝的关系

这是「钢琴单轨专精」的实际候选：先去掉 vocals，再用它把 piano 从伴奏中分出来。它不是六轨模型。

## 待核实

- 训练数据、音质和串音；
- 权重许可证；
- 与 BS-RoFormer SW 的 piano 轨、ByteDance/Transkun 转写的对比；
- 是否适合流行乐而不是爵士。
