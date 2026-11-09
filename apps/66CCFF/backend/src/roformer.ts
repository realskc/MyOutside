import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { KernelError } from "@myoutside/kernel";
import type { X66CCFFStemKind } from "@myoutside/contracts";
import { findMediaTool } from "./media.js";
import { enginePython, runCommand } from "./process.js";

const STEMS: X66CCFFStemKind[] = ["vocals", "drums", "bass", "other", "guitar", "piano"];
const MODEL_SLUG = "roformer-model-bs-roformer-sw-by-jarredou";

/**
 * Windows 使用 CUDA；macOS 没有 CUDA，且 bs-roformer-infer 已移除 MPS，走 CPU。
 * 可以用 MYOUTSIDE_SEPARATION_DEVICE=cpu / cuda / auto 覆盖。
 */
function separationDevice(): string {
  return process.env.MYOUTSIDE_SEPARATION_DEVICE?.trim() || (process.platform === "darwin" ? "cpu" : "cuda");
}

export interface RunSeparationOptions {
  engineDir: string;
  input: string;
  outputDir: string;
  signal?: AbortSignal;
  onProgress?: (progress: number, message: string) => void;
}

/**
 * 后台运行 BS-RoFormer SW 六轨分离，返回各轨文件路径。
 * 先统一转成 44.1kHz 立体声 WAV（bs-roformer-infer 只接受 WAV），
 * 再从 “预计剩余时间” 行估算进度；取消时终止子进程。
 */
export async function runSeparation(
  options: RunSeparationOptions,
): Promise<Partial<Record<X66CCFFStemKind, string>>> {
  const python = enginePython(options.engineDir);
  if (!python) {
    throw new KernelError("PRECONDITION", "分离引擎未安装");
  }

  const inputDir = join(options.outputDir, "input");
  const stemsDir = join(options.outputDir, "stems");
  mkdirSync(inputDir, { recursive: true });
  mkdirSync(stemsDir, { recursive: true });
  const wav = join(inputDir, "source.wav");

  options.onProgress?.(0.01, "准备音频…");
  await runCommand(
    findMediaTool("ffmpeg"),
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      options.input,
      "-vn",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      wav,
    ],
    { signal: options.signal },
  );

  options.onProgress?.(0.05, "加载模型…");

  let estimatedTotal: number | null = null;
  let lastProgress = 0.05;
  const report = (progress: number, message: string) => {
    lastProgress = Math.max(lastProgress, Math.min(0.98, progress));
    options.onProgress?.(lastProgress, message);
  };

  await runCommand(
    python,
    [
      "-m",
      "bs_roformer.inference",
      "--model",
      MODEL_SLUG,
      "--models_dir",
      join(options.engineDir, "models"),
      "--input_folder",
      inputDir,
      "--store_dir",
      stemsDir,
      "--output_format",
      "flac16",
      "--device",
      separationDevice(),
    ],
    {
      signal: options.signal,
      env: {
        BS_ROFORMER_MODELS_PATH: join(options.engineDir, "models"),
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
      },
      onLine: (line) => {
        const total = /Estimated total processing time for this track:\s*([\d.]+)/.exec(line);
        if (total) {
          estimatedTotal = Number(total[1]);
          report(0.1, `分离中（预计约 ${Math.ceil(estimatedTotal)} 秒）`);
          return;
        }
        const remaining = /Estimated time remaining:\s*([\d.]+)/.exec(line);
        if (remaining && estimatedTotal && estimatedTotal > 0) {
          const seconds = Number(remaining[1]);
          report(1 - seconds / estimatedTotal, `分离中（剩余约 ${Math.ceil(seconds)} 秒）`);
          return;
        }
        const percent = /(\d+)%/.exec(line);
        if (percent) {
          report(Number(percent[1]) / 100, `分离中 ${percent[1]}%`);
          return;
        }
        if (/Using model weights|load|model/i.test(line)) {
          report(0.08, "加载模型…");
        } else if (/Processing track|Total tracks found/i.test(line)) {
          report(0.1, "准备分离…");
        } else if (/Elapsed time/i.test(line)) {
          report(0.98, "写入结果…");
        }
      },
    },
  );

  const files: Partial<Record<X66CCFFStemKind, string>> = {};
  for (const kind of STEMS) {
    const file = join(stemsDir, `source_${kind}.flac`);
    if (existsSync(file)) files[kind] = file;
  }
  if (Object.keys(files).length !== STEMS.length) {
    throw new KernelError("INTERNAL", "分离结果缺少轨道：应为六轨");
  }
  report(0.98, "写入结果…");
  return files;
}
