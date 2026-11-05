import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { KernelError } from "@myoutside/kernel";
import type { PureblueStemKind } from "@myoutside/contracts";

const STEMS: PureblueStemKind[] = ["vocals", "drums", "bass", "other", "guitar", "piano"];

/** 应用管理的 venv 中的 Python；未安装返回 null */
export function enginePython(engineDir: string): string | null {
  const candidates = [
    join(engineDir, "venv", "Scripts", "python.exe"),
    join(engineDir, "venv", "bin", "python"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export interface RunDemucsOptions {
  engineDir: string;
  input: string;
  outputDir: string;
  signal?: AbortSignal;
  onProgress?: (progress: number, message: string) => void;
}

/**
 * 后台运行 Demucs 六轨分离，返回各轨文件路径。
 * 进度从 stderr/stdout 的百分比行解析；取消时终止子进程。
 */
export function runDemucs(options: RunDemucsOptions): Promise<Partial<Record<PureblueStemKind, string>>> {
  const python = enginePython(options.engineDir);
  if (!python) {
    throw new KernelError("PRECONDITION", "分离引擎未安装");
  }
  mkdirSync(options.outputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const args = [
      "-m",
      "demucs",
      "--name",
      "htdemucs_6s",
      "--out",
      options.outputDir,
      "--mp3",
      "--mp3-bitrate",
      "192",
      "--jobs",
      "1",
      options.input,
    ];
    const child = spawn(python, args, {
      env: {
        ...process.env,
        HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
      },
      windowsHide: true,
    });

    let lastProgress = 0;
    const tail: string[] = [];
    let settled = false;

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
        if (tail.length > 30) tail.shift();
        const match = /(\d+)%/.exec(line);
        if (match) {
          lastProgress = Math.max(0, Math.min(1, Number(match[1]) / 100));
          options.onProgress?.(lastProgress, `分离中 ${match[1]}%`);
        } else if (/load|separat|apply|download|model|cuda|device/i.test(line)) {
          options.onProgress?.(lastProgress, line.slice(0, 200));
        }
      }
    };

    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);

    child.on("error", (error) => {
      finish(() => reject(new KernelError("INTERNAL", `无法启动分离引擎：${error.message}`)));
    });

    child.on("close", (code) => {
      finish(() => {
        if (options.signal?.aborted) {
          reject(new KernelError("ABORTED", "分离已取消"));
          return;
        }
        if (code !== 0) {
          reject(
            new KernelError(
              "UPSTREAM",
              `分离失败（退出码 ${code}）：${tail.slice(-4).join(" | ").slice(0, 500)}`,
            ),
          );
          return;
        }
        try {
          const modelDir = join(options.outputDir, "htdemucs_6s");
          const dirs = readdirSync(modelDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
          if (dirs.length === 0) throw new Error("未找到分离输出目录");
          const trackDir = join(modelDir, dirs[0]!.name);
          const files: Partial<Record<PureblueStemKind, string>> = {};
          for (const kind of STEMS) {
            const file = join(trackDir, `${kind}.mp3`);
            if (existsSync(file)) files[kind] = file;
          }
          if (Object.keys(files).length === 0) throw new Error("没有生成任何轨道");
          resolve(files);
        } catch (error) {
          reject(
            new KernelError(
              "INTERNAL",
              `读取分离结果失败：${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      });
    });
  });
}
