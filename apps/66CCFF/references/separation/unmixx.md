# UNMIXX

- 最近核对：2026-11-10
- 代码：[jihoojung0106/unmixx](https://github.com/jihoojung0106/unmixx)（未声明许可证）；主页：[unmixx.github.io](https://unmixx.github.io/)（ICASSP 2026，KAIST）

## 是什么

**多人歌声分离**：把同时唱的两个歌手盲分离成两条（不需要事先知道是谁）。

## 已核实的事实

- 针对「歌声之间高度相关」（合唱、和声）设计；在 MedleyVox 评测集上比之前的方法高 2.2 dB 以上 SDRi（README）。
- 训练用约 400 小时歌声数据（含 OpenSinger、K_multisinger、K_multitimbre 等）。
- 仓库里有 `ckpt/`（配置和 `best.ckpt`），推理：`python inference.py --conf_path ckpt/conf.yml --ckpt_path ckpt/best.ckpt --audio_path <音频>`（README）。
- 输入应是已经分离出来的人声。
