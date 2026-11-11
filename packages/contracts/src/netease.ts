import { z } from "zod";

/**
 * 网易云下载（netease）：搜歌、下载（NETEASE-0001）。
 * 登录由本机官方网易云客户端负责，本应用只读它的登录状态；凭据只在后端内存里用，接口里不会出现。
 * 公开 API：`netease.download`、`netease.listDownloadedFiles`（作者：最多向纯蓝开放「下载」和「访问下载的音乐文件夹」）；其余是内部 API。
 */

/** 音质档位（网易云的 level），从低到高 */
export const NeteaseLevel = z.enum(["standard", "higher", "exhigh", "lossless", "hires"]);
export type NeteaseLevel = z.infer<typeof NeteaseLevel>;

export const NeteaseSongSchema = z.object({
  id: z.string(),
  name: z.string(),
  artists: z.array(z.string()),
  album: z.string(),
  durationMs: z.number().nullable(),
  /** 网易云的 fee：0 免费，1 VIP，8 免费听标准音质 / VIP 下高音质，4 购买专辑…… */
  fee: z.number().nullable(),
  /** 这个账号能下载的最高档位；null = 不能下载 */
  maxLevel: NeteaseLevel.nullable(),
});
export type NeteaseSong = z.infer<typeof NeteaseSongSchema>;

export const NeteaseSearchInput = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(30),
  offset: z.number().int().min(0).max(1000).default(0),
});
export type NeteaseSearchInput = z.infer<typeof NeteaseSearchInput>;

export const NeteaseSearchOutput = z.object({
  total: z.number().nullable(),
  songs: z.array(NeteaseSongSchema),
});
export type NeteaseSearchOutput = z.infer<typeof NeteaseSearchOutput>;

export const NeteaseStatusOutput = z.object({
  /** 找到了官方客户端的登录状态（不联网检查是否过期） */
  loggedIn: z.boolean(),
  /** 目前只支持 macOS */
  platformSupported: z.boolean(),
  message: z.string(),
  downloadDir: z.string(),
  /** 用的是默认文件夹（没在设置里改过） */
  downloadDirIsDefault: z.boolean(),
  defaultDownloadDir: z.string(),
  /** 今天（本地时间）真正下载了几首；文件夹里已有、没重复下载的不算（NETEASE-0002） */
  downloadsToday: z.number().int(),
  /** 每天最多下载几首（作者：50） */
  dailyLimit: z.number().int(),
  /** 下一首最早什么时候开始（毫秒时间戳）；现在就能开始时为 null */
  nextDownloadAt: z.number().nullable(),
  /** 排队中和正在下载的有几首 */
  queued: z.number().int(),
});
export type NeteaseStatusOutput = z.infer<typeof NeteaseStatusOutput>;

/**
 * 公开 API `netease.download`：下载一首歌（公开的普通异步函数，D-0086）。
 * - 排队：一次只下一首；上一首结束后随机等 10–20 秒才开始下一首；每天最多真正下载 50 首（NETEASE-0002）。
 *   本应用的界面和别的子应用发起的排同一个队、共用同一份额度，所以一次调用可能要等好几分钟；
 *   今天的额度满了报 `PRECONDITION`。调用方要等它结束（或取消），不能发起后不管。
 * - 进度事件见 `NeteaseDownloadEvent`，会原样推给发起调用的界面。
 * - 文件夹里已有同名文件：不重复下载、不覆盖，`alreadyExisted = true`，不记下载记录、不占额度。
 * - 中途失败或取消：不留下音频文件（只写 `.part`，出错时删掉），不记下载记录；已经向网易云发过请求的，照样算一次间隔。
 *   歌词拿不到不算失败：`lyricFile = null`，下次再下同一首会补上。
 */
export const NeteaseDownloadInput = z.object({
  songId: z.string().regex(/^[0-9]{1,20}$/),
  /** 不给就用账号能下载的最高档位 */
  level: NeteaseLevel.optional(),
});
export type NeteaseDownloadInput = z.infer<typeof NeteaseDownloadInput>;

/** `netease.download` 的进度事件 */
export interface NeteaseDownloadEvent {
  type: "progress";
  /** 0–1；排队、等待时为 0 */
  progress: number;
  message: string;
  /** 排队中：前面还有几首 */
  queued?: number;
  /** 等间隔中：什么时候开始（毫秒时间戳） */
  waitUntil?: number;
}

export const NeteaseDownloadSchema = z.object({
  id: z.string(),
  songId: z.string(),
  name: z.string(),
  artists: z.array(z.string()),
  album: z.string(),
  level: z.string(),
  bitrate: z.number().nullable(),
  /** 音频文件的绝对路径 */
  file: z.string(),
  /** 同名的 .lrc 歌词；这首歌没有歌词时为 null */
  lyricFile: z.string().nullable(),
  size: z.number(),
  createdAt: z.number().int(),
});
export type NeteaseDownload = z.infer<typeof NeteaseDownloadSchema>;

export const NeteaseDownloadOutput = NeteaseDownloadSchema.extend({
  /** 文件夹里已经有同名文件（比如官方客户端下过），没有重复下载 */
  alreadyExisted: z.boolean(),
});
export type NeteaseDownloadOutput = z.infer<typeof NeteaseDownloadOutput>;

export const NeteaseSetDownloadDirInput = z.object({
  /** 绝对路径；null = 恢复默认 */
  dir: z.string().min(1).nullable(),
});
export type NeteaseSetDownloadDirInput = z.infer<typeof NeteaseSetDownloadDirInput>;

export const NeteaseDownloadedFile = z.object({
  name: z.string(),
  /** 绝对路径 */
  path: z.string(),
  size: z.number(),
  modifiedAt: z.number().int(),
  /** 同名的 .lrc 歌词（有的话） */
  lyricPath: z.string().nullable(),
});
export type NeteaseDownloadedFile = z.infer<typeof NeteaseDownloadedFile>;

/** 公开 API：下载文件夹里的音频文件（给纯蓝等子应用用，NETEASE-0001） */
export const NeteaseListDownloadedFilesOutput = z.object({
  dir: z.string(),
  files: z.array(NeteaseDownloadedFile),
});
export type NeteaseListDownloadedFilesOutput = z.infer<typeof NeteaseListDownloadedFilesOutput>;

export interface NeteaseApi {
  "netease.getStatus": { input: Record<string, never>; output: NeteaseStatusOutput };
  "netease.search": { input: NeteaseSearchInput; output: NeteaseSearchOutput };
  "netease.download": { input: NeteaseDownloadInput; output: NeteaseDownloadOutput };
  "netease.listHistory": { input: Record<string, never>; output: NeteaseDownload[] };
  "netease.setDownloadDir": { input: NeteaseSetDownloadDirInput; output: { ok: true } };
  "netease.listDownloadedFiles": { input: Record<string, never>; output: NeteaseListDownloadedFilesOutput };
}
