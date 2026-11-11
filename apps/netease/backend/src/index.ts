import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { defineAsync, defineRead, defineTx, KernelError, type AppModule, type AsyncContext, type ReadContext } from "@myoutside/kernel";
import {
  NeteaseDownloadInput,
  NeteaseSearchInput,
  NeteaseSetDownloadDirInput,
  type NeteaseDownload,
  type NeteaseDownloadOutput,
  type NeteaseLevel,
  type NeteaseStatusOutput,
} from "@myoutside/contracts";
import { LEVELS, NeteaseClient } from "./client.js";
import { defaultCookiePaths, readMusicU, type CredentialResult } from "./cookies.js";
import { baseName, listAudioFiles } from "./files.js";

export { parseBinaryCookies, readMusicU } from "./cookies.js";
export { baseName } from "./files.js";

/**
 * 网易云下载（netease，NETEASE-0001）：搜歌、下载到网易云音乐的文件夹。
 * 登录由官方网易云客户端负责，这里只读它的登录状态；现阶段只给作者自己用。
 */

export interface NeteaseAppOptions {
  /** 官方客户端的 Cookie 文件，按顺序找第一个存在的；默认见 defaultCookiePaths()。冒烟检查传空数组，不碰真实账号 */
  cookiePaths?: string[];
  /** 默认下载文件夹；默认 ~/Music/网易云音乐（官方客户端在这台 Mac 上的下载文件夹） */
  defaultDownloadDir?: string;
  /** 测试用：替换网络请求 */
  fetch?: typeof fetch;
  /** 相邻两次下载之间随机等多久（毫秒）；默认 10–20 秒（作者，NETEASE-0002）。测试传小的值 */
  downloadGapMs?: { min: number; max: number };
  /** 每天最多真正下载几首；默认 50（作者，NETEASE-0002） */
  dailyLimit?: number;
  /** 测试用：时钟、随机数 */
  now?: () => number;
  random?: () => number;
}

interface SettingRow {
  key: string;
  value: string;
}

interface DownloadRow {
  id: string;
  song_id: string;
  name: string;
  artists: string;
  album: string;
  level: string;
  bitrate: number | null;
  file: string;
  lyric_file: string | null;
  size: number;
  created_at: number;
}

const InsertDownloadInput = z.object({
  id: z.string(),
  songId: z.string(),
  name: z.string(),
  artists: z.array(z.string()),
  album: z.string(),
  level: z.string(),
  bitrate: z.number().nullable(),
  file: z.string(),
  lyricFile: z.string().nullable(),
  size: z.number(),
});

const DOWNLOAD_DIR_KEY = "download_dir";

function toDownload(row: DownloadRow): NeteaseDownload {
  return {
    id: row.id,
    songId: row.song_id,
    name: row.name,
    artists: JSON.parse(row.artists) as string[],
    album: row.album,
    level: row.level,
    bitrate: row.bitrate,
    file: row.file,
    lyricFile: row.lyric_file,
    size: row.size,
    createdAt: row.created_at,
  };
}

/** 可以被取消的等待 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (signal.aborted) {
      reject(new KernelError("ABORTED", "已取消"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new KernelError("ABORTED", "已取消"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolvePromise();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** 等 `ready`，但发起方取消时马上放弃 */
function untilReady(ready: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new KernelError("ABORTED", "已取消"));
  return new Promise((resolvePromise, reject) => {
    const onAbort = () => reject(new KernelError("ABORTED", "已取消"));
    signal.addEventListener("abort", onAbort, { once: true });
    void ready.then(() => {
      signal.removeEventListener("abort", onAbort);
      resolvePromise();
    });
  });
}

function credentialMessage(credential: CredentialResult): string {
  if (credential.ok) return "已读到官方网易云客户端的登录状态";
  if (credential.reason === "missing") return "没找到官方网易云客户端的登录信息：请先安装网易云音乐并登录";
  if (credential.reason === "unreadable") return "官方网易云客户端的登录信息读不了";
  return "官方网易云客户端没有登录";
}

export function createNeteaseApp(options: NeteaseAppOptions = {}): AppModule {
  const cookiePaths = options.cookiePaths ?? defaultCookiePaths();
  const defaultDownloadDir = resolve(options.defaultDownloadDir ?? join(homedir(), "Music", "网易云音乐"));
  const fetchImpl = options.fetch ?? fetch;
  const platformSupported = options.cookiePaths !== undefined || process.platform === "darwin";
  const gap = options.downloadGapMs ?? { min: 10_000, max: 20_000 };
  const dailyLimit = options.dailyLimit ?? 50;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;

  // ---- 下载排队（NETEASE-0002）：一次只下一首；上一首结束后随机等 10–20 秒才开始下一首；每天最多 50 首 ----
  /** 队尾：每首下载拿一个位置，等前一个放行 */
  let tail: Promise<void> = Promise.resolve();
  /** 排队中和正在下载的有几首 */
  let queued = 0;
  /** 下一首最早开始的时间；null = 还没算过（第一次用时从最近一条下载记录推算：重启 MyOutside 也不会马上连着下） */
  let nextAllowedAt: number | null = null;

  const randomGap = (): number => gap.min + random() * (gap.max - gap.min);
  const startOfToday = (): number => {
    const day = new Date(now());
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  };
  /** 下载记录只记真正下载了的（NETEASE-0002），所以直接数今天的记录 */
  const downloadsToday = (ctx: Pick<ReadContext, "db">): number => ctx.db.count("download", { created_at: { gte: startOfToday() } });
  const nextStartAt = (ctx: Pick<ReadContext, "db">): number => {
    if (nextAllowedAt === null) {
      const last = ctx.db.all<DownloadRow>("download", undefined, { orderBy: "created_at DESC", limit: 1 })[0];
      nextAllowedAt = last ? last.created_at + randomGap() : 0;
    }
    return nextAllowedAt;
  };
  const limitError = () => new KernelError("PRECONDITION", `今天已经下载了 ${dailyLimit} 首，明天再来（防止下得太多被封控）`);
  const takeSlot = (): { ready: Promise<void>; release: () => void } => {
    let release!: () => void;
    const done = new Promise<void>((resolvePromise) => (release = resolvePromise));
    const ready = tail;
    tail = tail.then(() => done);
    return { ready, release };
  };

  const downloadDirOf = (ctx: Pick<ReadContext, "db">): { dir: string; isDefault: boolean } => {
    const row = ctx.db.get<SettingRow>("setting", { key: DOWNLOAD_DIR_KEY });
    return row ? { dir: row.value, isDefault: false } : { dir: defaultDownloadDir, isDefault: true };
  };

  /** 每次都重新读：作者在官方客户端里换了账号、重新登录，马上生效 */
  const client = (): NeteaseClient => {
    if (!platformSupported) throw new KernelError("PRECONDITION", "目前只支持 macOS");
    const credential = readMusicU(cookiePaths);
    if (!credential.ok) throw new KernelError("PRECONDITION", credentialMessage(credential));
    return new NeteaseClient(credential.token, fetchImpl);
  };

  return {
    id: "netease",
    name: "网易云下载",
    owns: ["setting", "download"],
    migrations: [
      {
        id: "0001_init",
        up: (ctx) => {
          ctx.createTable("setting", ["key TEXT PRIMARY KEY", "value TEXT NOT NULL"].join(", "));
          ctx.createTable(
            "download",
            [
              "id TEXT PRIMARY KEY",
              "song_id TEXT NOT NULL",
              "name TEXT NOT NULL",
              "artists TEXT NOT NULL", // JSON 数组
              "album TEXT NOT NULL",
              "level TEXT NOT NULL",
              "bitrate INTEGER",
              "file TEXT NOT NULL", // 绝对路径
              "lyric_file TEXT",
              "size INTEGER NOT NULL",
              "created_at INTEGER NOT NULL",
            ].join(", "),
          );
          ctx.createIndex("download_created", "download", "created_at");
        },
      },
    ],
    api: {
      getStatus: defineRead(z.object({}), (ctx): NeteaseStatusOutput => {
        const { dir, isDefault } = downloadDirOf(ctx);
        const credential: CredentialResult = platformSupported ? readMusicU(cookiePaths) : { ok: false, reason: "missing" };
        return {
          loggedIn: credential.ok,
          platformSupported,
          message: platformSupported ? credentialMessage(credential) : "目前只支持 macOS",
          downloadDir: dir,
          downloadDirIsDefault: isDefault,
          defaultDownloadDir,
          downloadsToday: downloadsToday(ctx),
          dailyLimit,
          nextDownloadAt: nextStartAt(ctx) > now() ? nextStartAt(ctx) : null,
          queued,
        };
      }),

      search: defineRead(NeteaseSearchInput, async (ctx, input) => client().search(input.query, input.limit ?? 30, input.offset ?? 0, ctx.signal)),

      /**
       * 公开 API：下载一首歌（公开的普通 API，D-0086；作者：最多向纯蓝开放「下载」）。契约见 contracts 的 NeteaseDownloadInput。
       * 硬性限制（作者，NETEASE-0002）：在应用内部排队，一次只下一首，上一首结束后随机等 10–20 秒才开始下一首；每天最多 50 首。
       * 不论是本应用的界面还是别的子应用发起，都排同一个队、共用同一份额度。
       */
      download: defineAsync(
        NeteaseDownloadInput,
        async (ctx, input): Promise<NeteaseDownloadOutput> => {
          const api = client();
          if (downloadsToday(ctx) >= dailyLimit) throw limitError();
          const ahead = queued;
          queued += 1;
          const slot = takeSlot();
          try {
            if (ahead > 0) ctx.emit({ type: "progress", progress: 0, message: `排队中：前面还有 ${ahead} 首`, queued: ahead });
            await untilReady(slot.ready, ctx.signal);
            // 轮到时再查一次：前面排队的可能已经把今天的额度用完了
            if (downloadsToday(ctx) >= dailyLimit) throw limitError();
            const wait = nextStartAt(ctx) - now();
            if (wait > 0) {
              ctx.emit({
                type: "progress",
                progress: 0,
                message: `等 ${Math.ceil(wait / 1000)} 秒再开始（防止下得太频繁）`,
                waitUntil: now() + wait,
              });
              await sleep(wait, ctx.signal);
            }
            try {
              return await downloadFlow(ctx, api, input, downloadDirOf(ctx).dir, now);
            } finally {
              // 不论成败都算一次：已经向网易云发了请求
              nextAllowedAt = now() + randomGap();
            }
          } finally {
            queued -= 1;
            slot.release();
          }
        },
        { visibility: "public" },
      ),

      insertDownload: defineTx(InsertDownloadInput, (ctx, input): NeteaseDownload => {
        const row: DownloadRow = {
          id: input.id,
          song_id: input.songId,
          name: input.name,
          artists: JSON.stringify(input.artists),
          album: input.album,
          level: input.level,
          bitrate: input.bitrate,
          file: input.file,
          lyric_file: input.lyricFile,
          size: input.size,
          created_at: now(),
        };
        ctx.db.insert("download", row as unknown as Record<string, string | number | null>);
        return toDownload(row);
      }),

      /** 最近的下载记录（只有真正下载了的），新的在前 */
      listHistory: defineRead(z.object({}), (ctx) =>
        ctx.db.all<DownloadRow>("download", undefined, { orderBy: "created_at DESC", limit: 100 }).map(toDownload),
      ),

      setDownloadDir: defineTx(NeteaseSetDownloadDirInput, (ctx, input) => {
        if (input.dir === null) {
          ctx.db.delete("setting", { key: DOWNLOAD_DIR_KEY });
          return { ok: true };
        }
        if (!isAbsolute(input.dir)) throw new KernelError("VALIDATION", "下载文件夹必须是绝对路径");
        if (ctx.db.get("setting", { key: DOWNLOAD_DIR_KEY })) {
          ctx.db.update("setting", { value: input.dir }, { key: DOWNLOAD_DIR_KEY });
        } else {
          ctx.db.insert("setting", { key: DOWNLOAD_DIR_KEY, value: input.dir });
        }
        return { ok: true };
      }),

      /** 公开 API：下载文件夹里的音频文件，给纯蓝等子应用读（作者：最多向纯蓝开放访问下载的音乐文件夹） */
      listDownloadedFiles: defineRead(
        z.object({}),
        (ctx) => {
          const { dir } = downloadDirOf(ctx);
          return { dir, files: listAudioFiles(dir) };
        },
        { visibility: "public" },
      ),
    },
  };
}

/**
 * 一首歌的下载流程：查权限 → 选档位 → 拿下载地址 → 下载并校验 → 存歌词 → 记下载记录。
 * 文件夹里已有同名文件（例如官方客户端下过）就不重复下载、不覆盖，也不记下载记录（NETEASE-0002：记录只算真正下载了的）。
 */
async function downloadFlow(
  ctx: AsyncContext,
  api: NeteaseClient,
  input: NeteaseDownloadInput,
  dir: string,
  now: () => number,
): Promise<NeteaseDownloadOutput> {
  ctx.emit({ type: "progress", progress: 0, message: "查询这首歌" });
  const song = await api.detail(input.songId, ctx.signal);
  if (!song.maxLevel) throw new KernelError("PRECONDITION", "这首歌这个账号不能下载");
  const level: NeteaseLevel = input.level ?? song.maxLevel;
  if (LEVELS.indexOf(level) > LEVELS.indexOf(song.maxLevel)) {
    throw new KernelError("PRECONDITION", `这首歌这个账号最高只能下 ${song.maxLevel}`);
  }
  const resource = await api.downloadUrl(song.id, level, ctx.signal);

  if (!isAbsolute(dir)) throw new KernelError("PRECONDITION", "下载文件夹不是绝对路径");
  mkdirSync(dir, { recursive: true });
  const base = baseName(song.artists, song.name);
  const file = join(dir, `${base}.${resource.type}`);
  const alreadyExisted = existsSync(file);
  if (!alreadyExisted) {
    ctx.emit({ type: "progress", progress: 0.02, message: "下载中" });
    await api.fetchFile(resource.url, resource, file, {
      signal: ctx.signal,
      onProgress: (done, total) => ctx.emit({ type: "progress", progress: 0.02 + 0.93 * (done / total), message: "下载中" }),
    });
  }

  ctx.emit({ type: "progress", progress: 0.97, message: "保存歌词" });
  const lyricPath = join(dir, `${base}.lrc`);
  let lyricFile: string | null = existsSync(lyricPath) ? lyricPath : null;
  let lyricNote = "";
  if (!lyricFile) {
    // 歌词是附带的：拿不到不影响下载结果；偶尔会失败一次（2026-11-11 实测遇到过），重试一次。
    // 还是不行就在进度里说明；再下一次同一首歌会补上
    let lyric: string | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        lyric = await api.lyric(song.id, ctx.signal);
        lyricNote = lyric ? "" : "（这首歌没有歌词）";
        break;
      } catch (error) {
        if (ctx.signal.aborted) throw error;
        lyricNote = "（歌词没拿到，再下一次会补上）";
      }
    }
    if (lyric) {
      try {
        writeFileSync(lyricPath, lyric, { encoding: "utf8", flag: "wx" });
        lyricFile = lyricPath;
      } catch {
        lyricFile = existsSync(lyricPath) ? lyricPath : null;
      }
    }
  }

  const record = {
    id: randomUUID(),
    songId: song.id,
    name: song.name,
    artists: song.artists,
    album: song.album,
    level: resource.level,
    bitrate: resource.bitrate,
    file,
    lyricFile,
    size: resource.size,
  };
  const saved: NeteaseDownload = alreadyExisted
    ? { ...record, createdAt: now() }
    : ((await ctx.call("netease.insertDownload", record)) as NeteaseDownload);
  ctx.emit({ type: "progress", progress: 1, message: (alreadyExisted ? "文件夹里已经有了" : "下载完成") + lyricNote });
  return { ...saved, alreadyExisted };
}
