"""纯蓝的 GAME 转写脚本（66CCFF-0017）：一条人声 → 一个单旋律 MIDI。

GAME（openvpi）只管音符；节拍用 beat_this 在**整首歌**上检测（和纯蓝调用 MuScriptor 时一样），
小节线写法照 MuScriptor：MIDI 没有弱起小节，把音符整体延后，让第一个强拍落在小节线上，
并在第一轨记 marker `muscriptor:bar_offset=<秒>`（纯蓝读 MIDI 时会减回去，66CCFF-0016）。
节拍部分改写自 MuScriptor 0.4.0 的 `muscriptor/utils/beats.py`（MIT）。

进度按行打印 JSON（和 transcribe_muscriptor.py 一样）：
  {"stage": "loading"} / {"stage": "beats"} / {"stage": "transcribing", "completed": n, "total": m}
  {"stage": "done", "bpm": x}
出错时打印 {"stage": "error", "message": "..."}，退出码非 0。

运行：<venv>/bin/python transcribe_game.py <人声> <输出.mid> --engine <game-engine 目录> [--beats-audio <整首歌>] [--language zh]
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path

MODEL_NAME = "GAME-1.0-large"
TICKS_PER_BEAT = 480
BAR_OFFSET_MARKER = "muscriptor:bar_offset="
# 和 MuScriptor 一样：拟合直线的残差小于一拍的 5% 就当作恒定速度
MAX_TEMPO_RESIDUAL = 0.05
MIN_METER_AGREEMENT = 0.9
MIN_BEATS = 8
EXTRA_BEAT_SPACING = 0.7
# 合唱 aahs（GM 52），和 MuScriptor 的 voice 一样
VOICE_PROGRAM = 52


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


# ---- 节拍（改写自 MuScriptor 的 beats.py） ----


def regularized_beats(beats):
    """补上漏检的拍、去掉多检的拍：按拍距中位数，隔了约 n 拍就均匀补 n - 1 个，离上一拍太近的丢掉"""
    import numpy as np

    beats = np.asarray(beats, dtype=float)
    if len(beats) < 3:
        return beats
    period = float(np.median(np.diff(beats)))
    kept = [beats[0]]
    for beat in beats[1:]:
        apart = (beat - kept[-1]) / period
        if apart < EXTRA_BEAT_SPACING:
            continue
        missing = max(1, round(apart))
        kept.extend(kept[-1] + (beat - kept[-1]) * np.arange(1, missing) / missing)
        kept.append(beat)
    return np.asarray(kept)


def fit_tempo(beats):
    """最小二乘拟合「第几拍 → 秒」的直线：返回（BPM，第 0 拍的秒数，残差）"""
    import numpy as np

    index = np.arange(len(beats))
    slope, intercept = np.polyfit(index, beats, 1)
    residual = beats - (intercept + slope * index)
    return 60.0 / float(slope), float(intercept), float(residual.std())


def beats_per_bar(beats, downbeats):
    """强拍之间隔几拍；九成小节都同意才算数，否则 None（不写拍号）"""
    import numpy as np

    if len(downbeats) < 3 or len(beats) < 2:
        return None
    index = np.abs(np.asarray(downbeats)[:, None] - beats[None, :]).argmin(axis=1)
    counts = np.diff(index)
    counts = counts[counts >= 2]
    if not len(counts):
        return None
    values, tally = np.unique(counts, return_counts=True)
    best = int(tally.argmax())
    if tally[best] / len(counts) < MIN_METER_AGREEMENT:
        return None
    return int(values[best])


class Timeline:
    """原音频的秒 ↔ MIDI 的拍：第 1 小节从 tick 0 开始，第一个强拍落在小节线上"""

    def __init__(self, beats, downbeats):
        import numpy as np

        self.beats = regularized_beats(beats)
        if len(self.beats) < MIN_BEATS:
            raise ValueError(f"只检测到 {len(self.beats)} 拍")
        self.bpm, first_beat, residual = fit_tempo(self.beats)
        self.period = 60.0 / self.bpm
        self.steady = residual <= MAX_TEMPO_RESIDUAL * self.period
        self.meter = beats_per_bar(self.beats, downbeats)
        bar = self.meter or 4
        # 强拍落在第几拍（按小节取余）：取检测到的强拍里最多的那种。
        # 不直接用第一个强拍：beat_this 偶尔多报一个，整首的小节线就错一拍（白石溪上，全曲 135 个强拍里 81 个落在同一种位置）
        downbeat_index = 0
        if len(downbeats):
            nearest = np.abs(np.asarray(downbeats)[:, None] - self.beats[None, :]).argmin(axis=1)
            downbeat_index = int(np.bincount(nearest % bar, minlength=bar).argmax())
        if self.steady:
            # 恒定速度：用拟合的直线，位置 =（时间 − 强拍）/ 拍长
            first_downbeat = first_beat + downbeat_index * self.period
            self.times = np.array([first_downbeat, first_downbeat + self.period])
            self.positions = np.array([0.0, 1.0])
        else:
            # 跟着检测到的拍走：每一拍一个速度
            self.times = self.beats
            self.positions = np.arange(len(self.beats), dtype=float) - downbeat_index
        # tick 0 = 原音频 0 秒之前（或正好）最近的一条小节线
        self.start = bar * math.floor(self.position(0.0) / bar)
        self.offset = max(0.0, -self.time_at(self.start))

    def position(self, seconds: float) -> float:
        import numpy as np

        times, positions = self.times, self.positions
        if seconds < times[0]:
            return float(positions[0] + (seconds - times[0]) / self.period)
        if seconds > times[-1]:
            return float(positions[-1] + (seconds - times[-1]) / self.period)
        return float(np.interp(seconds, times, positions))

    def time_at(self, position: float) -> float:
        import numpy as np

        times, positions = self.times, self.positions
        if position < positions[0]:
            return float(times[0] + (position - positions[0]) * self.period)
        if position > positions[-1]:
            return float(times[-1] + (position - positions[-1]) * self.period)
        return float(np.interp(position, positions, times))

    def tick(self, seconds: float) -> int:
        return max(0, round((self.position(seconds) - self.start) * TICKS_PER_BEAT))

    def tempo_changes(self):
        """(tick, 每拍微秒数)；相邻相同的合并"""
        changes = [(0, round(self.period * 1e6))]
        if not self.steady:
            for i in range(len(self.times) - 1):
                tick = round((self.positions[i] - self.start) * TICKS_PER_BEAT)
                if tick < 0:
                    continue
                tempo = round((self.times[i + 1] - self.times[i]) * 1e6)
                if tick == changes[-1][0]:
                    changes[-1] = (tick, tempo)
                elif tempo != changes[-1][1]:
                    changes.append((tick, tempo))
            last = round((self.positions[-1] - self.start) * TICKS_PER_BEAT)
            if last > changes[-1][0]:
                changes.append((last, round(self.period * 1e6)))
        return changes


def detect_timeline(path: str):
    """整首歌的节拍；检测不出来时返回 None（MIDI 用 120 BPM，不延后）"""
    import librosa
    from beat_this.inference import Audio2Beats

    # 和 MuScriptor 一样按 16kHz 单声道读入，两边检测出的拍才一致
    signal, sr = librosa.load(path, sr=16000, mono=True)
    if len(signal) < sr:
        return None
    beats, downbeats = Audio2Beats(checkpoint_path="final0", device="cpu", dbn=False)(signal, sr)
    try:
        return Timeline(beats, downbeats)
    except ValueError as error:
        print(f"节拍检测失败：{error}；用 120 BPM", file=sys.stderr)
        return None


# ---- 写 MIDI ----


def write_midi(notes, timeline, output: str) -> None:
    import mido

    midi = mido.MidiFile(ticks_per_beat=TICKS_PER_BEAT, type=1)
    meta = mido.MidiTrack()
    midi.tracks.append(meta)
    if timeline is not None and timeline.meter:
        meta.append(mido.MetaMessage("time_signature", numerator=timeline.meter, denominator=4, time=0))
    if timeline is not None and timeline.offset > 0:
        meta.append(mido.MetaMessage("marker", text=f"{BAR_OFFSET_MARKER}{timeline.offset:.4f}", time=0))
    changes = timeline.tempo_changes() if timeline is not None else [(0, 500000)]
    last = 0
    for tick, tempo in changes:
        meta.append(mido.MetaMessage("set_tempo", tempo=tempo, time=tick - last))
        last = tick

    def to_tick(seconds: float) -> int:
        if timeline is None:
            return round(seconds * 2 * TICKS_PER_BEAT)
        return timeline.tick(seconds)

    events = []
    for onset, offset, pitch in notes:
        note = max(0, min(127, round(pitch)))
        start = to_tick(onset)
        end = max(start + 1, to_tick(offset))
        events.append((start, 1, mido.Message("note_on", note=note, velocity=100)))
        events.append((end, 0, mido.Message("note_off", note=note, velocity=0)))
    events.sort(key=lambda event: (event[0], event[1]))
    track = mido.MidiTrack()
    midi.tracks.append(track)
    track.append(mido.MetaMessage("track_name", name="Vocals (GAME)", time=0))
    track.append(mido.Message("program_change", program=VOICE_PROGRAM, time=0))
    last = 0
    for tick, _, message in events:
        track.append(message.copy(time=tick - last))
        last = tick
    midi.save(output)


# ---- GAME ----


def transcribe(audio: str, game_dir: Path, model_path: Path, language: str):
    """GAME 的 extract 流程（infer.py），只是把结果收进内存、按切片报进度"""
    sys.path.insert(0, str(game_dir))
    os.chdir(game_dir)
    from inference.api import infer_model, load_inference_model
    from inference.callbacks import SaveCombinedFileCallback
    from inference.data import SlicedAudioFileIterableDataset
    from inference.slicer2 import Slicer
    from lib.config.schema import ValidationConfig

    model, lang_map = load_inference_model(model_path)
    language_id = lang_map.get(language, 0) if (language and lang_map) else 0
    sr = model.inference_config.features.audio_sample_rate
    dataset = SlicedAudioFileIterableDataset(
        filemap={"audio": Path(audio)},
        samplerate=sr,
        slicer=Slicer(sr=sr, threshold=-40.0, min_length=1000, min_interval=200, max_sil_kept=100),
        language=language_id,
    )
    collected = []

    class Collect(SaveCombinedFileCallback):
        done = 0

        def on_predict_batch_end(self, trainer, pl_module, outputs, batch, batch_idx, dataloader_idx=0):
            super().on_predict_batch_end(trainer, pl_module, outputs, batch, batch_idx, dataloader_idx)
            Collect.done += batch["size"]
            emit({"stage": "transcribing", "completed": Collect.done, "total": max(batch["num_parts"])})

        def flush(self, key, notes, logger_fn):
            collected.extend((note.onset, note.offset, note.pitch) for note in notes)

    emit({"stage": "transcribing", "completed": 0, "total": 0})
    # 默认参数和 `infer.py extract` 一样
    infer_model(
        model=model,
        dataset=dataset,
        config=ValidationConfig(
            d3pm_sample_t0=0.0,
            d3pm_sample_steps=8,
            d3pm_sample_ts=None,
            boundary_decoding_threshold=0.2,
            boundary_decoding_radius=round(0.02 / model.timestep),
            note_presence_threshold=0.2,
        ),
        batch_size=1,  # 一首歌常常只切成几段，一段一批进度才会动
        num_workers=0,
        callbacks=[Collect(output_dir=game_dir)],
    )
    return sorted(collected)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("output")
    parser.add_argument("--engine", required=True, help="game-engine 目录（里面有 GAME/ 和 models/）")
    parser.add_argument("--beats-audio", help="检测节拍用的整首歌；不给就用 audio")
    parser.add_argument("--language", default="zh", help="GAME 的语言：zh / ja / en / yue")
    args = parser.parse_args()

    engine = Path(args.engine).resolve()
    game_dir = engine / "GAME"
    model_path = engine / "models" / MODEL_NAME / "model.pt"
    if not (game_dir / "infer.py").exists() or not model_path.exists():
        emit({"stage": "error", "message": f"GAME 没装好：{engine}"})
        return 3
    audio = str(Path(args.audio).resolve())
    beats_audio = str(Path(args.beats_audio or args.audio).resolve())
    output = str(Path(args.output).resolve())

    emit({"stage": "loading"})
    emit({"stage": "beats"})
    timeline = detect_timeline(beats_audio)
    notes = transcribe(audio, game_dir, model_path, args.language)
    write_midi(notes, timeline, output)
    emit({"stage": "done", "bpm": timeline.bpm if timeline is not None else None})
    return 0


if __name__ == "__main__":
    sys.exit(main())
