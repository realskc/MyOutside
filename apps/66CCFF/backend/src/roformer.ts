import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { KernelError } from "@myoutside/kernel";
import type { X66CCFFStemKind } from "@myoutside/contracts";

const STEMS: X66CCFFStemKind[] = ["vocals", "drums", "bass", "other", "guitar", "piano"];
const MODEL_SLUG = "roformer-model-bs-roformer-sw-by-jarredou";

/** 应用管理的 venv 中的 Python；未安装返回 null */
export function enginePython(engineDir: string): string | null {
  const candidates = [
    join(engineDir, "venv", "Scripts", "python.exe"),
    join(engineDir, "venv", "bin", "python"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

interface RunCommandOptions {
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  onLine?: (line: string) => void;
}

/** 运行子进程，收集输出尾行；取消时终止进程。 */
function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
      windowsHide: true,
    });

    let settled = false;
    const tail: string[] = [];

    const finish = (work: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      work();
    };

    const onAbort = () => {
      child.kill();
    };
    options.signal?.addEventListener("abort", onAbort);

    const handleChunk = (chunk: Buffer) => {
      const text = chunk.toString("utf8").replace(/\u001b\[[0-9;]*m/g, "");
      for (const rawLine of text.split(/[\r\n]+/)) {
        const line = rawLine.trim();
        if (!line) continue;
        tail.push(line);
        if (tail.length > 40) tail.shift();
        options.onLine?.(line);
      }
    };

    child.stdout?.on("data", handleChunk);
    child.stderr?.on("data", handleChunk);

    child.on("error", (error) => {
      finish(() => reject(new KernelError("INTERNAL", `无法启动 ${command}：${error.message}`)));
    });

    child.on("close", (code) => {
      finish(() => {
        if (options.signal?.aborted) {
          reject(new KernelError("ABORTED", "分离已取消"));
          return;
        }
        if (code !== 0) {
          const detail = tail.slice(-4).join(" | ").slice(0, 500);
          reject(new KernelError("UPSTREAM", `${command} 失败（退出码 ${code}）${detail ? `：${detail}` : ""}`));
          return;
        }
        resolve();
      });
    });
  });
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
    "ffmpeg",
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
      "cuda",
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
