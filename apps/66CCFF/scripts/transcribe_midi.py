#!/usr/bin/env python
"""纯蓝：把一条 stem（单轨音频）转成 MIDI。

只接受一个输入音频；不做整首歌转写，也不做多轨合并。
引擎：Basic Pitch（Windows 上走 ONNX Runtime）。
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import warnings
from contextlib import redirect_stdout
from pathlib import Path


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    warnings.filterwarnings("ignore", message="pkg_resources is deprecated as an API.*", category=UserWarning)

    parser = argparse.ArgumentParser(description="Transcribe one audio stem to MIDI with Basic Pitch.")
    parser.add_argument("input", help="single stem audio file")
    parser.add_argument("output", help="output .mid path")
    parser.add_argument("--instrument-name", default=None, help="MIDI instrument name (default: input stem)")
    parser.add_argument("--program", type=int, default=0, help="General MIDI program (default: 0, acoustic grand piano)")
    parser.add_argument("--min-frequency", type=float, default=None)
    parser.add_argument("--max-frequency", type=float, default=None)
    parser.add_argument("--onset-threshold", type=float, default=0.5)
    parser.add_argument("--frame-threshold", type=float, default=0.3)
    parser.add_argument("--minimum-note-length", type=float, default=127.7, help="milliseconds")
    parser.add_argument("--tempo", type=float, default=120.0)
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    if not input_path.is_file():
        raise SystemExit(f"input not found: {input_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Basic Pitch 的依赖 resampy 会通过 pkg_resources 输出弃用警告；不要污染 JSON 输出。
    logging.getLogger().setLevel(logging.ERROR)

    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import predict

    print(json.dumps({"stage": "predicting", "input": str(input_path)}), flush=True)
    # Basic Pitch 会往 stdout 打印进度；转到 stderr，保持 stdout 只有 JSON。
    with redirect_stdout(sys.stderr):
        _, midi_data, _ = predict(
            input_path,
            model_or_model_path=ICASSP_2022_MODEL_PATH,
            onset_threshold=args.onset_threshold,
            frame_threshold=args.frame_threshold,
            minimum_note_length=args.minimum_note_length,
            minimum_frequency=args.min_frequency,
            maximum_frequency=args.max_frequency,
            midi_tempo=args.tempo,
        )

    if midi_data.instruments:
        midi_data.instruments[0].name = args.instrument_name or input_path.stem
        midi_data.instruments[0].program = max(0, min(127, args.program))

    midi_data.write(str(output_path))
    notes = [note for instrument in midi_data.instruments for note in instrument.notes]
    pitches = [int(note.pitch) for note in notes]
    summary = {
        "ok": True,
        "input": str(input_path),
        "output": str(output_path),
        "bytes": int(output_path.stat().st_size),
        "notes": len(notes),
        "pitch_min": min(pitches) if pitches else None,
        "pitch_max": max(pitches) if pitches else None,
        "duration": float(round(midi_data.get_end_time(), 3)),
        "model": str(ICASSP_2022_MODEL_PATH),
    }
    print(json.dumps(summary, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
