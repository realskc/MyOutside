# MedleyVox 与合唱分离模型

- 最近核对：2026-11-10
- 数据集与代码：[jeonchangbin49/MedleyVox](https://github.com/jeonchangbin49/MedleyVox)（ICASSP 2023）；排行榜：[MVSEP Medley Vox Leaderboard](https://www.mvsep.com/quality_checker/leaderboard/medley)；社区经验：[MSST Bible：For two singers in a duet](https://msst-bible.pages.dev/for-two-singers-in-a-duet-from-one-song)

## 是什么

MedleyVox 是**多人歌声分离**的评测集（齐唱、合唱、主唱 vs 其余），论文也提出了模型，但作者没有公开权重。

## 已核实的事实

- 社区（Cyru5）复现训练了模型并公开权重，24kHz，可在 MVSEP 上用（MVSEP 算法页）。
- MVSEP 排行榜（合唱 SDR）前几名是 MVSEP 的 BS / Mel-RoFormer「duet model」，其次是 Cyru5 的 MedleyVox（排行榜）。
- 社区经验（MSST Bible）：在分离出的人声上用 karaoke 模型（如 becruily & frazer BS Karaoke）、Mel-RoFormer duet 模型或 MedleyVox；男女声分离模型对**音域相近**的歌手效果差；两人唱同样的音时 karaoke 模型基本不行。
