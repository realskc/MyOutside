import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/** Homebrew / MacPorts 的常见路径；从 Finder 启动 Electron 时 PATH 往往不包含它们。 */
const MACOS_MEDIA_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"];

/**
 * 找到 ffmpeg / ffprobe。
 * 优先使用 FFMPEG_PATH / FFPROBE_PATH，其次查 PATH，最后补查 macOS 常见安装目录。
 * 找不到时返回裸命令名，让 spawn 给出原始错误。
 */
export function findMediaTool(name: "ffmpeg" | "ffprobe"): string {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const override = process.env[`${name.toUpperCase()}_PATH`]?.trim();
  const candidates: string[] = override ? [override] : [];

  const pathDirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  if (process.platform === "darwin") pathDirs.push(...MACOS_MEDIA_DIRS);
  for (const dir of pathDirs) candidates.push(join(dir, executable));

  return candidates.find((candidate) => existsSync(candidate)) ?? name;
}
