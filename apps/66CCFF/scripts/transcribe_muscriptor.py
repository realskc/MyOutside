"""纯蓝的 MuScriptor 转写脚本（66CCFF-0012）：一条音频 → 一个 MIDI。

和 `muscriptor transcribe` 做的事一样（检测节拍、写进 MIDI），只是把转写进度按行打印成 JSON，
方便纯蓝显示进度。节拍在 `--beats-audio`（纯蓝传整首歌）上检测，同一首歌的每次转写都用同一套小节线（66CCFF-0017）：
  {"stage": "loading"} / {"stage": "beats"} / {"stage": "transcribing", "completed": n, "total": m}
  {"stage": "done", "bpm": x}
出错时打印 {"stage": "error", "message": "..."}，退出码非 0。

运行：<venv>/bin/python transcribe_muscriptor.py <音频> <输出.mid> --instrument acoustic_piano [--model medium] [--beats-audio <整首歌>]
"""

import argparse
import json
import sys
from pathlib import Path


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("output")
    parser.add_argument("--instrument", required=True, help="MuScriptor 的乐器组名，例如 acoustic_piano")
    parser.add_argument("--model", default="medium")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--beats-audio", help="检测节拍用的音频（整首歌）；不给就用转写的音频")
    args = parser.parse_args()

    from muscriptor.events import NoteStartEvent, ProgressEvent
    from muscriptor.tokenizer.mt3 import resolve_instrument_names
    from muscriptor.transcription_model import TranscriptionModel
    from muscriptor.utils.download import ModelDownloadError
    from muscriptor.utils.midi import ExportOptions

    try:
        instruments = resolve_instrument_names([args.instrument])
    except ValueError as error:
        emit({"stage": "error", "message": f"未知的乐器：{error}"})
        return 2

    emit({"stage": "loading"})
    try:
        model = TranscriptionModel.load_model(
            weights_path=args.model, device=None if args.device == "auto" else args.device
        )
    except ModelDownloadError as error:
        emit({"stage": "error", "message": str(error)})
        return 3

    emit({"stage": "beats"})
    beat_grid = model.detect_beat_grid_for(args.beats_audio or args.audio, "best-effort")

    events = []
    for event in model.transcribe(args.audio, instruments=instruments):
        if isinstance(event, ProgressEvent):
            emit({"stage": "transcribing", "completed": event.completed, "total": event.total})
            continue
        events.append(event)

    onsets = [event.start_time for event in events if isinstance(event, NoteStartEvent)]
    if beat_grid is not None:
        beat_grid = beat_grid.with_onset_delay(onsets)
    midi_bytes = model.events_to_midi_bytes(iter(events), beat_grid=beat_grid, export=ExportOptions())
    Path(args.output).write_bytes(midi_bytes)
    bpm = getattr(beat_grid, "bpm", None) if beat_grid is not None else None
    # 不报音符数：这里的「音符开始」会把跨 5 秒分块延续的音符重复算进去，音符数由纯蓝从写好的 MIDI 里数（66CCFF-0014）
    emit({"stage": "done", "bpm": bpm})
    return 0


if __name__ == "__main__":
    sys.exit(main())
