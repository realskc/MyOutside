# duet-svs-diffusion（用扩散模型做对唱分离）

- 最近核对：2026-11-10
- 论文：Chin-Yun Yu 等，*Zero-Shot Duet Singing Voices Separation with Diffusion Models*（Sound Demixing Workshop 2023，[arXiv:2311.07345](https://arxiv.org/abs/2311.07345)）
- 代码：[iamycy/duet-svs-diffusion](https://github.com/iamycy/duet-svs-diffusion)（MIT，默认分支 `sdx-workshop`）；权重在 Google Drive（`last.ckpt`，5.09GB，含训练状态）

## 是什么

**只学过「一个人唱歌」的扩散模型当先验**，从两人混在一起的人声里同时采样两路，并要求两路相加等于混合（不需要成对的分离数据，所以叫 zero-shot）。为了让同一路一直是同一个人，**自回归**：每段 5.46 秒，前面一部分固定成上一段自己分出来的结果。

## 已核实的事实（论文、代码）

- 先验：UNet，4.24 亿参数，24kHz 单声道；训练数据 8 个歌声数据集共 100 多小时，含 M4Singer、Opencpop、OpenSinger（中文）、JVS-MuSiC、PJS（日文）等。
- MedleyVox 对唱（103 段，都很短）：SI-SDRi 11.24 dB（自回归），有监督的 iSRNet 是 15.10 dB；用 100 步扩散，论文选 75% 重叠。
- 注意：仓库的 `eval.py` 默认拿**标准答案**当前一段的条件（teacher forcing，`--self-cond` 才用自己的结果），`--retry` 也是按标准答案挑候选；实际用时只能用 `--self-cond`、不能 retry。

## 本机验证（Mac，2026-11-10）

- 环境：Python 3.11 venv，PyTorch 2.15，`audio-diffusion-pytorch==0.0.92`；没用仓库的 Lightning / hydra，直接建 `AudioDiffusionModel` 读权重，`separate_mixture` 照抄 `eval.py`。MPS 上一次前向（两路 × 5.46 秒）0.105 秒；100 步、每步重采样 2 次，每往前 2.73 秒要约 21 秒（约 8 倍实时）。
- **人工对唱**（《泠重乞愿》天依 + 《久徊》阿绫各 20 秒，和 [按参考提取](singer-informed-separation.md) 的试验同一段）：
  - 50% 重叠：两路对答案 SI-SDR 约 −1 dB，比不分离（0 dB）还差；每 2 秒看一次，20 秒里两个人在两路之间对调 3 次；
  - 75% 重叠（论文的设置）：−1.6 dB，对调 4 次；
  - 只看很短的一段，它是分得开的：每 1 秒各自取好的对应，平均 4.7 dB（75% 重叠 3.6 dB）。问题出在身份保持不住，和 UNMIXX 一样。
- **《白石溪》人声分轨**（46.5–298 秒，50% 重叠，35 分钟）：按萌娘百科颜色，独唱时间只有 55% 落在「这个人那一路」（瞎猜 50%）；独唱的字上，响的一路只比另一路大 9.3 dB（中位；UNMIXX 是 20–25 dB），连独唱都没能集中到一路。
- 结论：两个女声虚拟歌手，单人歌声先验分不清谁是谁；论文的对唱测试段很短，长歌里身份一定会漂。
- 试听：`~/Downloads/白石溪 MIDI/对唱分离试验/扩散-人工对唱-…`（混合、两条答案、分出的两路）和 `扩散-白石溪-分出第1路.flac`、`第2路.flac`（前面补了 46.5 秒静音，和原曲对齐）（2026-11-10 作者听过后删除）。

## 更新的扩散 / 生成式分离（2026-11-10 查）

都不是分「两个人」，而是把人声和伴奏分开，或者分说话人：

- Plaja-Roglans 等（Music.AI / UPF）：*Generating Separated Singing Vocals Using a Diffusion Model Conditioned on Music Mixtures*（WASPAA 2025）、*Efficient and Fast Generative-Based Singing Voice Separation using a Latent Diffusion Model*（IJCNN 2025，代码 `diffusion-separation/ldm-vocal-extraction`）；
- Diff-VS（2026）：扩散 U-Net 分人声；
- *Flow Matching-Based Speech Source Separation with Best-of-N Biometric Sampling*（ICML 2026 workshop）：两人说话的分离，生成多个候选、挑两路说话人特征最不像的那个。这个「挑候选」的思路可以搬到唱歌上，但要有能分清两个歌手的特征（我们的 ECAPA 试验只有 84–87%）。
