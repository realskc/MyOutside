import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { KernelError } from "@myoutside/kernel";
import { findMediaTool } from "./media.js";
import { enginePython, runCommand } from "./process.js";

/** MuScriptor 0.4.0 的乐器组（`muscriptor list-instruments`）；转写时只允许其中一个（66CCFF-0012） */
export const MUSCRIPTOR_INSTRUMENTS = [
  "acoustic_piano",
  "electric_piano",
  "chromatic_percussion",
  "organ",
  "acoustic_guitar",
  "clean_electric_guitar",
  "distorted_electric_guitar",
  "acoustic_bass",
  "electric_bass",
  "violin",
  "viola",
  "cello",
  "contrabass",
  "orchestral_harp",
  "timpani",
  "string_ensemble",
  "synth_strings",
  "voice",
  "orchestra_hit",
  "trumpet",
  "trombone",
  "tuba",
  "french_horn",
  "brass_section",
  "soprano_and_alto_sax",
  "tenor_sax",
  "baritone_sax",
  "oboe",
  "english_horn",
  "bassoon",
  "clarinet",
  "flutes",
  "synth_lead",
  "synth_pad",
  "drums",
] as const;

/** MuScriptor 的权重要登录 HuggingFace 才能下载：有 HF_TOKEN 或 huggingface_hub 的 token 文件就算已登录 */
export function huggingFaceLoggedIn(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.HF_TOKEN?.trim()) return true;
  const hfHome = env.HF_HOME?.trim() || join(env.XDG_CACHE_HOME?.trim() || join(homedir(), ".cache"), "huggingface");
  const tokenPath = env.HF_TOKEN_PATH?.trim() || join(hfHome, "token");
  return existsSync(tokenPath);
}

export interface RunTranscriptionOptions {
  engineDir: string;
  /** apps/66CCFF/scripts/transcribe_muscriptor.py */
  script: string;
  /** 一条或几条 stem；几条时先混成一条 */
  inputs: string[];
  instrument: string;
  model: string;
  workDir: string;
  signal?: AbortSignal;
  onProgress?: (progress: number, message: string) => void;
}

export interface TranscriptionResult {
  midiFile: string;
  bpm: number | null;
}

/** 后台运行 MuScriptor：多条 stem 先用 ffmpeg 混成一条，再转成一个 MIDI；进度来自脚本逐行打印的 JSON */
export async function runTranscription(options: RunTranscriptionOptions): Promise<TranscriptionResult> {
  const python = enginePython(options.engineDir);
  if (!python) throw new KernelError("PRECONDITION", "转写引擎未安装");
  if (options.inputs.length === 0) throw new KernelError("VALIDATION", "至少选一条轨");
  mkdirSync(options.workDir, { recursive: true });

  let input = options.inputs[0]!;
  if (options.inputs.length > 1) {
    options.onProgress?.(0.01, "混合所选的轨…");
    input = join(options.workDir, "input.wav");
    await runCommand(
      findMediaTool("ffmpeg"),
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        ...options.inputs.flatMap((file) => ["-i", file]),
        "-filter_complex",
        `amix=inputs=${options.inputs.length}`,
        // MuScriptor 自己按 16kHz 单声道读入，混好的文件直接用这个规格，省空间
        "-ac",
        "1",
        "-ar",
        "16000",
        input,
      ],
      { signal: options.signal },
    );
  }

  const midiFile = join(options.workDir, "output.mid");
  let result: { bpm: number | null } | null = null;
  let scriptError: string | null = null;
  options.onProgress?.(0.03, "加载模型…");
  try {
    await runCommand(
      python,
      [options.script, input, midiFile, "--instrument", options.instrument, "--model", options.model],
      {
        signal: options.signal,
        env: {
          // 权重缓存在引擎目录里；登录用的 token 仍在 HuggingFace 默认位置
          HF_HUB_CACHE: join(options.engineDir, "models"),
          HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
          PYTHONUNBUFFERED: "1",
          PYTHONIOENCODING: "utf-8",
        },
        onLine: (line) => {
          if (!line.startsWith("{")) return;
          let event: { stage?: string; completed?: number; total?: number; bpm?: number | null; message?: string };
          try {
            event = JSON.parse(line);
          } catch {
            return;
          }
          if (event.stage === "loading") options.onProgress?.(0.03, "加载模型…");
          else if (event.stage === "beats") options.onProgress?.(0.06, "检测节拍…");
          else if (event.stage === "transcribing" && event.total) {
            const done = event.completed ?? 0;
            options.onProgress?.(0.08 + 0.9 * (done / event.total), `转写中 ${done}/${event.total}`);
          } else if (event.stage === "done") result = { bpm: event.bpm ?? null };
          else if (event.stage === "error") scriptError = event.message ?? "转写失败";
        },
      },
    );
  } catch (error) {
    if (scriptError && !(error instanceof KernelError && error.code === "ABORTED")) {
      throw new KernelError("UPSTREAM", scriptError);
    }
    throw error;
  }
  if (!result || !existsSync(midiFile)) throw new KernelError("INTERNAL", scriptError ?? "转写没有输出 MIDI");
  return { midiFile, bpm: (result as { bpm: number | null }).bpm };
}
