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

## 本机验证（Mac，2026-11-10）

- 环境：仓库代码 + 自带的 `ckpt/best.ckpt`（约 0.95M 参数，24kHz 单声道，两路输出），Python 3.11 venv（代码用了 `distutils`，3.12 不行），PyTorch 2.15，Apple M4 Pro。装在临时目录里试，没有接进纯蓝。
- `requirements.txt` 钉死了上百个包，实际推理只要 torch、librosa、soundfile、pyyaml、huggingface_hub、`typeguard<3`、torch_complex、asteroid（`--no-deps`）；`look2hear.utils` 一导入就会拉 pytorch_lightning、rich、praat-parselmouth、pandas、matplotlib、torchaudio。
- 速度：**CPU 上 1 秒音频要约 100 秒**（主要耗在 NNPACK 卷积）。在 MPS 上要改三处：`.type(x.type())` 改成 `.to(x.dtype)`；`adaptive_avg_pool1d` 在 MPS 上不支持除不尽的尺寸（70 个子带 → 35 → 18……），遇到时挪到 CPU 上算；改完后 8 秒一块约 7.5 秒，大约实时。
- 自带的 `inference.py` 一次处理整个文件；模型按 4 秒片段训练。试验时分块跑：每块 800 帧（约 8 秒），块间重叠 2 秒、线性交叉淡化；两路输出的顺序按和上一块重叠部分的相关性对齐（《白石溪》56 块里换了 30 次顺序）。
- 《白石溪》BS-RoFormer SW 分出的 vocals（5 分 34 秒），用时 414 秒：
  - 独唱段两路响度差 20–25 dB（50–80 秒、160–220 秒在第 1 路，220–260 秒在第 2 路），看起来是真把人分开了；
  - 90–130 秒、260–300 秒两路都有声音，像是对唱 / 和声（第 1 路比第 2 路小约 15 dB）；
  - 两路各自用 GAME large 转 MIDI：302 / 267 个音符；独唱段里小的那一路也会被转出一些音（串音）。去掉「这一路比另一路小 20 dB 以上」的音后剩 266 / 255 个，两路同时有音约 82 秒；同时唱的地方，音程多是同度，也有二度、三度。
- **分块盲分离的局限**：两路只在连续唱、有重叠可以对齐时保持「同一个人在同一路」；一段独唱结束、隔一段再唱时，下一段落在哪一路是随机的。所以第 1 / 2 路不等于洛天依 / 乐正绫，要固定到人，得用 [按参考录音提取指定歌手](singer-informed-separation.md) 一类的方法，或者另做歌手识别。
- 结果（作者听了：几乎没有分开两个人，见 [想法](unmixx-thoughts.md)）：`~/Downloads/白石溪 MIDI/对唱分离试验/白石溪-人声-UNMIXX-1.wav`、`-2.wav`，两轨 MIDI `~/Downloads/白石溪 MIDI/白石溪-人声分两人-UNMIXX+GAME.mid`（按 MuScriptor 人声 MIDI 的速度表写，小节线一致）（2026-11-10 作者听过后删除）。
