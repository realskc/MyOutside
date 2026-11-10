# MuScriptor：我们的想法

- 2026-11-10：作者听了《白石溪》人声转出的 MIDI（vocals stem → `voice`），转录效果不太理想，有很多错音和瑕疵；之后要找更厉害的转人声 MIDI 的模型。
  - agent 注：后来发现 MuScriptor 写的 MIDI 为了对齐小节线，把音符整体延后了（《白石溪》人声 0.40 秒），当时在 GarageBand 里和音频一起听时也是晚的（见 [66CCFF-0016](../../user-spec/decisions/66CCFF-0016-midi-bar-offset.md)）。去掉延后后，GAME 的 373 个音符里有 366 个在同一时间有 MuScriptor 的同音高音符；MuScriptor 多出来的是高八度以上的音和叠音。
  - 2026-11-10：作者说这个延后应该没影响自己的判断。
