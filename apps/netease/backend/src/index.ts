import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { defineAsync, defineRead, defineTx, KernelError, type AppModule, type ReadContext } from "@myoutside/kernel";
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
        };
      }),

      search: defineRead(NeteaseSearchInput, async (ctx, input) => client().search(input.query, input.limit ?? 30, input.offset ?? 0, ctx.signal)),

      /**
       * 下载一首歌（普通的异步函数，只能是内部 API，D-0063）：查权限 → 选档位 → 拿下载地址 → 下载并校验 → 存歌词 → 记一条下载记录。
       * 文件夹里已有同名文件（例如官方客户端下过）就不重复下载、不覆盖。
       */
      download: defineAsync(NeteaseDownloadInput, async (ctx, input): Promise<NeteaseDownloadOutput> => {
        const api = client();
        ctx.emit({ type: "progress", progress: 0, message: "查询这首歌" });
        const song = await api.detail(input.songId, ctx.signal);
        if (!song.maxLevel) throw new KernelError("PRECONDITION", "这首歌这个账号不能下载");
        const level: NeteaseLevel = input.level ?? song.maxLevel;
        if (LEVELS.indexOf(level) > LEVELS.indexOf(song.maxLevel)) {
          throw new KernelError("PRECONDITION", `这首歌这个账号最高只能下 ${song.maxLevel}`);
        }
        const resource = await api.downloadUrl(song.id, level, ctx.signal);

        const { dir } = downloadDirOf(ctx);
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
        const saved = (await ctx.call("netease.insertDownload", record)) as NeteaseDownload;
        ctx.emit({ type: "progress", progress: 1, message: (alreadyExisted ? "文件夹里已经有了" : "下载完成") + lyricNote });
        return { ...saved, alreadyExisted };
      }),

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
          created_at: Date.now(),
        };
        ctx.db.insert("download", row as unknown as Record<string, string | number | null>);
        return toDownload(row);
      }),

      /** 最近的下载记录，新的在前 */
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
