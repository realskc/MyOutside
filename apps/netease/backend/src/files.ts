import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { NeteaseDownloadedFile } from "@myoutside/contracts";

/**
 * 文件和官方客户端一样命名（NETEASE-0001）：`歌手1,歌手2 - 歌名.扩展名`。
 * 官方客户端会把名字里的空格换成不换行空格（U+00A0）、`/` 换成全角 `／`（本机 ~/Music/网易云音乐 里看到的）；
 * 其余 Windows 不允许的字符也换成全角，以后在 Windows 上也能用。
 */

const FULL_WIDTH: Record<string, string> = {
  "/": "／",
  "\\": "＼",
  ":": "：",
  "*": "＊",
  "?": "？",
  '"': "＂",
  "<": "＜",
  ">": "＞",
  "|": "｜",
};

function clean(part: string): string {
  return part
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[/\\:*?"<>|]/g, (ch) => FULL_WIDTH[ch] ?? "_")
    .replace(/ /g, "\u00a0")
    .trim();
}

/** 不带扩展名的文件名；太长时截断（macOS 单个文件名最多 255 字节，留出扩展名和 `.part`） */
export function baseName(artists: string[], title: string): string {
  const who = artists.map(clean).filter(Boolean).join(",");
  let name = who ? `${who} - ${clean(title)}` : clean(title);
  if (!name || name === "." || name === "..") name = "untitled";
  while (Buffer.byteLength(name, "utf8") > 200) name = name.slice(0, -1);
  return name.replace(/^\.+/, "");
}

const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".m4a", ".ogg", ".wav", ".aac"]);

/** 下载文件夹里的音频文件（不进子文件夹），新的在前；同名的 .lrc 一起带上 */
export function listAudioFiles(dir: string): NeteaseDownloadedFile[] {
  if (!existsSync(dir)) return [];
  const files: NeteaseDownloadedFile[] = [];
  for (const name of readdirSync(dir)) {
    if (!AUDIO_EXTENSIONS.has(extname(name).toLowerCase())) continue;
    const path = join(dir, name);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const lyric = join(dir, `${name.slice(0, -extname(name).length)}.lrc`);
    files.push({
      name,
      path,
      size: stat.size,
      modifiedAt: Math.round(stat.mtimeMs),
      lyricPath: existsSync(lyric) ? lyric : null,
    });
  }
  return files.sort((a, b) => b.modifiedAt - a.modifiedAt);
}
