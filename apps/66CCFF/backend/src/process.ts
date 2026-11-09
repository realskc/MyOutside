import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { KernelError } from "@myoutside/kernel";

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
export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<void> {
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
          reject(new KernelError("ABORTED", "已取消"));
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
