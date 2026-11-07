# Mel-Band RoFormer Guitar（becruily）

- 最近核对：2026-11-07
- 权重：[becruily/mel-band-roformer-guitar](https://huggingface.co/becruily/mel-band-roformer-guitar)
- 许可证：模型卡未注明（待核实）

## 已核实的事实

- HF 仓库存在；文件包括：
  - `becruily_guitar.ckpt`
  - `config.yaml`
  - `config_guitar_becruily.yaml`
- 配置里的 `instruments` 是 `Guitar / Other`，`target_instrument: Guitar`；即目标是从伴奏/混音中提取吉他，并不是六轨模型。
- 模型仓库有约 182 次下载、13 个赞（核对时点）。
- 模型卡是空的；没有许可证说明、训练数据说明或评测数字。

## 与纯蓝的关系

如果它的实际效果可靠，可以作为「吉他单轨提取」候选，再接 Basic Pitch 转 MIDI；但许可证和效果都还需要验证，不能直接当作可分发组件。
