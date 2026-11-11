import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * 读官方网易云客户端的登录状态（NETEASE-0001）：macOS 的 `.binarycookies` 文件里 `.music.163.com` 域的 `MUSIC_U`。
 * 只在后端内存里用；任何报错信息里都不带它的值。
 */

/** 官网下载的客户端在这里；App Store 版如果有沙盒，可能在 Containers 下（推断，没验证） */
export function defaultCookiePaths(): string[] {
  if (process.platform !== "darwin") return [];
  const home = homedir();
  return [
    join(home, "Library", "HTTPStorages", "com.netease.163music.binarycookies"),
    join(home, "Library", "Containers", "com.netease.163music", "Data", "Library", "HTTPStorages", "com.netease.163music.binarycookies"),
  ];
}

export interface Cookie {
  domain: string;
  name: string;
  path: string;
  value: string;
}

/**
 * Apple 的二进制 Cookie 格式：`cook`、页数（大端）、各页长度（大端），然后是各页；
 * 页里是小端的 Cookie 个数和偏移；每条 Cookie 在偏移 16/20/24/28 处记着域名、名字、路径、值（各自以 NUL 结尾）。
 */
export function parseBinaryCookies(raw: Buffer): Cookie[] {
  if (raw.length < 8 || raw.toString("latin1", 0, 4) !== "cook") throw new Error("不是 binarycookies 文件");
  const pages = raw.readUInt32BE(4);
  if (8 + pages * 4 > raw.length) throw new Error("binarycookies 文件不完整");
  const cookies: Cookie[] = [];
  let pos = 8 + pages * 4;
  for (let i = 0; i < pages; i += 1) {
    const size = raw.readUInt32BE(8 + i * 4);
    const page = raw.subarray(pos, pos + size);
    pos += size;
    if (page.length < 8) continue;
    const count = page.readUInt32LE(4);
    for (let k = 0; k < count && 8 + k * 4 + 4 <= page.length; k += 1) {
      const offset = page.readUInt32LE(8 + k * 4);
      if (offset + 4 > page.length) continue;
      const record = page.subarray(offset, offset + page.readUInt32LE(offset));
      if (record.length < 32) continue;
      const field = (at: number): string => {
        const start = record.readUInt32LE(at);
        const end = record.indexOf(0, start);
        return start < record.length && end >= 0 ? record.toString("utf8", start, end) : "";
      };
      cookies.push({ domain: field(16), name: field(20), path: field(24), value: field(28) });
    }
  }
  return cookies;
}

export type CredentialResult = { ok: true; token: string } | { ok: false; reason: "missing" | "unreadable" | "not-logged-in" };

export function readMusicU(paths: string[]): CredentialResult {
  const file = paths.find((path) => existsSync(path));
  if (!file) return { ok: false, reason: "missing" };
  let cookies: Cookie[];
  try {
    cookies = parseBinaryCookies(readFileSync(file));
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const values = cookies
    .filter((cookie) => cookie.name === "MUSIC_U" && (cookie.domain === ".music.163.com" || cookie.domain === "music.163.com"))
    .map((cookie) => cookie.value)
    .filter((value) => value && !/[\r\n;]/.test(value));
  // 只认唯一的一个：有多个时不猜用哪个
  if (values.length !== 1) return { ok: false, reason: "not-logged-in" };
  return { ok: true, token: values[0]! };
}
