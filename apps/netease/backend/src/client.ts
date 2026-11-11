import { createHash } from "node:crypto";
import { renameSync, rmSync } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { KernelError } from "@myoutside/kernel";
import type { NeteaseLevel, NeteaseSong } from "@myoutside/contracts";

/**
 * 网易云接口（NETEASE-0001）。只用这四个：搜索、歌曲详情（含本账号的权限）、下载地址、歌词。
 * 登录凭据只放进发给 interface.music.163.com 的 Cookie；下载音频的 CDN 请求不带它。错误信息里不带凭据和签名地址。
 */

export const API_HOST = "https://interface.music.163.com";

/** 和官方 macOS 客户端一样的 User-Agent（是否必要没核实过；普通 UA 下标准音质也行） */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NeteaseMusicDesktop/3.1.13.3451";

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_BYTES = 300 * 1024 * 1024;

export const LEVELS: readonly NeteaseLevel[] = ["standard", "higher", "exhigh", "lossless", "hires"];

/** 详情里 privilege.dlLevel 是这个账号能下的最高档位；不认识的档位（例如 jymaster）按能认识的最高处理 */
export function levelOf(value: unknown, bitrate: unknown): NeteaseLevel | null {
  if (typeof value === "string" && (LEVELS as readonly string[]).includes(value)) return value as NeteaseLevel;
  if (typeof value === "string" && value !== "none" && value !== "") return "hires";
  if (typeof bitrate === "number" && bitrate > 0) {
    if (bitrate >= 999000) return "lossless";
    if (bitrate >= 320000) return "exhigh";
    if (bitrate >= 192000) return "higher";
    return "standard";
  }
  return null;
}

type Fetch = typeof fetch;

function aborted(signal?: AbortSignal): boolean {
  return !!signal?.aborted;
}

export class NeteaseClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async post(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetchImpl(API_HOST + path, {
        method: "POST",
        redirect: "manual",
        headers: {
          // os=osx：缺了它，有的歌（例如《白石溪》无损）拿到的 CDN 地址会被拒（403）；2026-11-11 实测
          Cookie: `MUSIC_U=${this.token}; os=osx`,
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params),
        signal,
      });
    } catch {
      if (aborted(signal)) throw new KernelError("ABORTED", "已取消");
      throw new KernelError("UPSTREAM", "连不上网易云");
    }
    if (response.status !== 200) throw new KernelError("UPSTREAM", `网易云接口返回 HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_JSON_BYTES) throw new KernelError("UPSTREAM", "网易云接口的响应太大");
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new KernelError("UPSTREAM", "网易云接口的响应不是 JSON");
    }
    if (data.code !== 200) {
      throw new KernelError("UPSTREAM", `网易云拒绝了请求（code ${String(data.code)}）；请在官方客户端确认已登录`);
    }
    return data;
  }

  async search(query: string, limit: number, offset: number, signal?: AbortSignal): Promise<{ total: number | null; songs: NeteaseSong[] }> {
    const data = await this.post(
      "/api/cloudsearch/pc",
      { s: query, type: "1", limit: String(limit), offset: String(offset), total: "true" },
      signal,
    );
    const result = (data.result ?? {}) as { songCount?: unknown; songs?: unknown };
    const songs = Array.isArray(result.songs) ? (result.songs as Array<Record<string, unknown>>) : [];
    return {
      total: typeof result.songCount === "number" ? result.songCount : null,
      songs: songs.filter((song) => /^[0-9]+$/.test(String(song.id ?? ""))).map((song) => toSong(song, song.privilege)),
    };
  }

  async detail(songId: string, signal?: AbortSignal): Promise<NeteaseSong> {
    const data = await this.post("/api/v3/song/detail", { c: JSON.stringify([{ id: songId }]), ids: `[${songId}]` }, signal);
    const songs = Array.isArray(data.songs) ? (data.songs as Array<Record<string, unknown>>) : [];
    const privileges = Array.isArray(data.privileges) ? (data.privileges as unknown[]) : [];
    const song = songs[0];
    if (songs.length !== 1 || String(song?.id) !== songId) throw new KernelError("NOT_FOUND", `网易云上没有这首歌：${songId}`);
    return toSong(song!, privileges[0]);
  }

  async downloadUrl(
    songId: string,
    level: NeteaseLevel,
    signal?: AbortSignal,
  ): Promise<{ url: string; size: number; md5: string; type: string; level: string; bitrate: number | null }> {
    const data = await this.post("/api/song/enhance/download/url/v1", { id: songId, level, immerseType: "c51" }, signal);
    const resource = (data.data ?? {}) as Record<string, unknown>;
    if (resource.code !== 200 || typeof resource.url !== "string" || !resource.url) {
      throw new KernelError("PRECONDITION", "网易云没有给出下载地址（这首歌可能不能下载，或需要会员）");
    }
    if (resource.freeTrialInfo) throw new KernelError("PRECONDITION", "网易云只给了试听片段，不是完整的歌");
    const size = resource.size;
    const md5 = resource.md5;
    if (typeof size !== "number" || size <= 0 || size > MAX_AUDIO_BYTES) throw new KernelError("UPSTREAM", "下载地址给出的文件大小不对");
    if (typeof md5 !== "string" || !/^[0-9a-fA-F]{32}$/.test(md5)) throw new KernelError("UPSTREAM", "下载地址缺少 MD5");
    let url: URL;
    try {
      url = new URL(resource.url);
    } catch {
      throw new KernelError("UPSTREAM", "下载地址格式不对");
    }
    if (!url.hostname.endsWith(".music.126.net") || url.username || url.password) {
      throw new KernelError("UPSTREAM", "下载地址不在网易云的 CDN 上");
    }
    url.protocol = "https:";
    const type = typeof resource.type === "string" && /^[a-z0-9]{2,5}$/i.test(resource.type) ? resource.type.toLowerCase() : "mp3";
    return {
      url: url.toString(),
      size,
      md5: md5.toLowerCase(),
      type,
      level: typeof resource.level === "string" ? resource.level : level,
      bitrate: typeof resource.br === "number" ? resource.br : null,
    };
  }

  /** 歌词（标准 LRC）；没有歌词时为 null */
  async lyric(songId: string, signal?: AbortSignal): Promise<string | null> {
    const data = await this.post("/api/song/lyric", { id: songId, lv: "-1", kv: "-1", tv: "-1" }, signal);
    const lyric = ((data.lrc ?? {}) as { lyric?: unknown }).lyric;
    return typeof lyric === "string" && lyric.trim() ? lyric : null;
  }

  /**
   * 从 CDN 下载到 `target`：先写 `<target>.part`，大小和 MD5 都对了才改名；出错或取消时删掉残留。
   * CDN 请求不带账号 Cookie。
   */
  async fetchFile(
    url: string,
    expected: { size: number; md5: string },
    target: string,
    options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
  ): Promise<void> {
    const part = `${target}.part`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, { redirect: "manual", headers: { "User-Agent": USER_AGENT }, signal: options.signal });
    } catch {
      if (aborted(options.signal)) throw new KernelError("ABORTED", "已取消");
      throw new KernelError("UPSTREAM", "连不上网易云的 CDN");
    }
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (response.status !== 200 || !response.body || contentType.includes("text/html")) {
      throw new KernelError("UPSTREAM", `网易云的 CDN 没有给出音频（HTTP ${response.status}）`);
    }
    let handle: FileHandle;
    try {
      handle = await open(part, "wx");
    } catch (error) {
      await response.body.cancel().catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new KernelError("CONFLICT", "这首歌正在下载");
      throw new KernelError("PRECONDITION", "下载文件夹写不进去");
    }
    const digest = createHash("md5");
    let done = 0;
    let lastReport = 0;
    try {
      const reader = response.body.getReader();
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        done += value.byteLength;
        if (done > expected.size) throw new KernelError("UPSTREAM", "下载到的文件比预期大");
        digest.update(value);
        await handle.write(value);
        if (options.onProgress && (done - lastReport > 256 * 1024 || done === expected.size)) {
          lastReport = done;
          options.onProgress(done, expected.size);
        }
      }
      await handle.close();
      if (done !== expected.size || digest.digest("hex") !== expected.md5) {
        throw new KernelError("UPSTREAM", "下载到的文件不完整（大小或 MD5 不对）");
      }
      renameSync(part, target);
    } catch (error) {
      await handle.close().catch(() => undefined);
      rmSync(part, { force: true });
      if (aborted(options.signal)) throw new KernelError("ABORTED", "已取消");
      if (error instanceof KernelError) throw error;
      throw new KernelError("UPSTREAM", "下载中断了");
    }
  }
}

/** 搜索结果和详情里的歌曲 → 我们的格式；权限（privilege）决定这个账号最高能下哪一档 */
function toSong(song: Record<string, unknown>, privilege: unknown): NeteaseSong {
  const artists = (song.ar ?? song.artists ?? []) as Array<{ name?: unknown }>;
  const album = (song.al ?? song.album ?? {}) as { name?: unknown };
  const right = (privilege ?? {}) as Record<string, unknown>;
  const canDownload = typeof right.st !== "number" || right.st >= 0;
  return {
    id: String(song.id),
    name: typeof song.name === "string" ? song.name : "",
    artists: artists.map((artist) => (typeof artist.name === "string" ? artist.name : "")).filter(Boolean),
    album: typeof album.name === "string" ? album.name : "",
    durationMs: typeof song.dt === "number" ? song.dt : typeof song.duration === "number" ? song.duration : null,
    fee: typeof song.fee === "number" ? song.fee : null,
    maxLevel: canDownload ? levelOf(right.dlLevel ?? right.downloadMaxBrLevel, right.dl ?? right.downloadMaxbr) : null,
  };
}
