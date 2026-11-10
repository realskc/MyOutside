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

/** GAME（66CCFF-0017）：只转人声旋律；记录里的 model 以 `game-` 开头 */
export const GAME_MODEL = "game-large";
const GAME_WEIGHTS = "GAME-1.0-large";

export type TranscriptionEngine = "muscriptor" | "game";

export function engineOfModel(model: string): TranscriptionEngine {
  return model.startsWith("game-") ? "game" : "muscriptor";
}

/** GAME 引擎目录里要有 venv、代码（GAME/infer.py）和权重 */
export function gameInstalled(engineDir: string): boolean {
  return (
    enginePython(engineDir) !== null &&
    existsSync(join(engineDir, "GAME", "infer.py")) &&
    existsSync(join(engineDir, "models", GAME_WEIGHTS, "model.pt"))
  );
}

/** MuScriptor 的权重要登录 HuggingFace 才能下载：有 HF_TOKEN 或 huggingface_hub 的 token 文件就算已登录 */
export function huggingFaceLoggedIn(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.HF_TOKEN?.trim()) return true;
  const hfHome = env.HF_HOME?.trim() || join(env.XDG_CACHE_HOME?.trim() || join(homedir(), ".cache"), "huggingface");
  const tokenPath = env.HF_TOKEN_PATH?.trim() || join(hfHome, "token");
  return existsSync(tokenPath);
}

export interface RunTranscriptionOptions {
  engine: TranscriptionEngine;
  engineDir: string;
  /** apps/66CCFF/scripts/transcribe_muscriptor.py 或 transcribe_game.py */
  script: string;
  /** 一条或几条 stem；几条时先混成一条 */
  inputs: string[];
  /** 检测节拍用的整首歌：同一首歌的每次转写都用同一套小节线（66CCFF-0017）；没有就在 inputs 上检测 */
  beatsAudio?: string | null;
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

/** 后台运行转写脚本：多条 stem 先用 ffmpeg 混成一条，再转成一个 MIDI；进度来自脚本逐行打印的 JSON */
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
        // 混成引擎读入的规格，省空间：MuScriptor 16kHz 单声道，GAME 44.1kHz 单声道
        "-ac",
        "1",
        "-ar",
        options.engine === "game" ? "44100" : "16000",
        input,
      ],
      { signal: options.signal },
    );
  }

  // 检测节拍用的整首歌：先用 ffmpeg 解成 16kHz 单声道 WAV，m4a / aac 等格式也能读，两个引擎拿到的也是同一个文件（66CCFF-0017）
  let beatsAudio: string | null = null;
  if (options.beatsAudio) {
    beatsAudio = join(options.workDir, "beats.wav");
    await runCommand(
      findMediaTool("ffmpeg"),
      ["-hide_banner", "-loglevel", "error", "-y", "-i", options.beatsAudio, "-ac", "1", "-ar", "16000", beatsAudio],
      { signal: options.signal },
    );
  }

  const midiFile = join(options.workDir, "output.mid");
  let result: { bpm: number | null } | null = null;
  let scriptError: string | null = null;
  options.onProgress?.(0.03, "加载模型…");
  try {
    const beats = beatsAudio ? ["--beats-audio", beatsAudio] : [];
    const args =
      options.engine === "game"
        ? [options.script, input, midiFile, "--engine", options.engineDir, ...beats]
        : [options.script, input, midiFile, "--instrument", options.instrument, "--model", options.model, ...beats];
    await runCommand(
      python,
      args,
      {
        signal: options.signal,
        env: {
          // MuScriptor 的权重缓存在引擎目录里；登录用的 token 仍在 HuggingFace 默认位置
          ...(options.engine === "muscriptor"
            ? { HF_HUB_CACHE: join(options.engineDir, "models"), HF_HUB_DISABLE_SYMLINKS_WARNING: "1" }
            : {}),
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
