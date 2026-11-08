import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import {
  DeleteTrackInput,
  EngineStatusInput,
  EngineStatusOutput,
  GetTrackInput,
  ImportTrackInput,
  ListTracksInput,
  X66CCFFStemKind,
  StartSeparationInput,
  type X66CCFFJobStatus,
  type X66CCFFStemKind as StemKind,
  type X66CCFFTrackDetail,
} from "@myoutside/contracts";
import {
  defineAsync,
  defineRead,
  defineTx,
  KernelError,
  type AppDb,
  type AppModule,
  type AsyncContext,
  type SqlValue,
} from "@myoutside/kernel";
import { Midi } from "@tonejs/midi";
import { z } from "zod";
import { findMediaTool } from "./media.js";
import { enginePython, runSeparation } from "./roformer.js";

const STEM_ORDER: StemKind[] = ["vocals", "drums", "bass", "other", "guitar", "piano"];
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"]);
/** 超过这个时间仍是 running 的任务，视为应用关闭 / 崩溃遗留 */
const STALE_JOB_MS = 60 * 60 * 1000;

const InsertTrackInput = z.object({
  id: z.string(),
  title: z.string().min(1),
  file: z.string(),
  ext: z.string(),
  size: z.number().int(),
  duration: z.number(),
});

const InsertJobInput = z.object({ id: z.string(), trackId: z.string() });

const UpdateJobInput = z.object({
  jobId: z.string(),
  patch: z.object({
    status: z.enum(["running", "succeeded", "failed", "cancelled"]).optional(),
    progress: z.number().optional(),
    message: z.string().optional(),
    error: z.string().nullable().optional(),
  }),
});

const FinishJobInput = z.object({
  jobId: z.string(),
  trackId: z.string(),
  stems: z.array(
    z.object({ kind: X66CCFFStemKind, file: z.string(), size: z.number().int() }),
  ),
});

const DeleteTrackTxInput = z.object({ trackId: z.string() });
const ReadMidiInput = z.object({ path: z.string() });
const MAX_MIDI_BYTES = 10 * 1024 * 1024;

interface TrackRow {
  id: string;
  title: string;
  file: string;
  ext: string;
  size: number;
  duration: number;
  created_at: number;
}

interface JobRow {
  id: string;
  track_id: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
  created_at: number;
  updated_at: number;
}

interface StemRow {
  id: string;
  track_id: string;
  job_id: string;
  kind: string;
  file: string;
  size: number;
  created_at: number;
}

export interface X66CCFFAppOptions {
  /** 应用私有文件根（<userData>/apps/66CCFF） */
  dataDir: string;
  /** BS-RoFormer 分离引擎目录；默认 dataDir/roformer-engine */
  engineDir?: string;
}

/** 各平台的引擎安装命令；UI 的“引擎未安装”提示直接展示它。 */
function engineSetupCommand(): string {
  if (process.platform === "darwin") return "bash apps/66CCFF/scripts/setup-engine-macos.sh";
  if (process.platform === "win32") {
    return "powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-engine.ps1";
  }
  return "请参考 apps/66CCFF/docs/README.md 手动安装分离引擎";
}

/** 探测音频时长（秒）；ffprobe 不可用时返回 0 */
function probeDuration(file: string): number {
  try {
    const result = spawnSync(
      findMediaTool("ffprobe"),
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { encoding: "utf8", windowsHide: true, timeout: 15000 },
    );
    const value = Number(result.stdout.trim());
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function createX66CCFFApp({
  dataDir,
  engineDir = join(dataDir, "roformer-engine"),
}: X66CCFFAppOptions): AppModule {
  const base = resolve(dataDir);
  const engine = resolve(engineDir);

  const abs = (relPath: string): string => {
    const resolved = resolve(base, relPath);
    if (resolved !== base && !resolved.startsWith(base + sep)) {
      throw new KernelError("VALIDATION", "非法文件路径");
    }
    return resolved;
  };

  const rel = (absolute: string): string => relative(base, absolute).split(sep).join("/");

  const getTrackOrThrow = (db: AppDb, trackId: string): TrackRow => {
    const row = db.get<TrackRow>("track", { id: trackId });
    if (!row) throw new KernelError("NOT_FOUND", `曲目不存在：${trackId}`);
    return row;
  };

  const latestJob = (db: AppDb, trackId: string): JobRow | undefined =>
    db.all<JobRow>("job", { track_id: trackId }, { orderBy: "updated_at DESC", limit: 1 })[0];

  const isStale = (job: JobRow | undefined): boolean =>
    !!job && job.status === "running" && Date.now() - job.updated_at > STALE_JOB_MS;
  const effectiveStatus = (job: JobRow | undefined): X66CCFFJobStatus | null =>
    !job ? null : isStale(job) ? "failed" : (job.status as X66CCFFJobStatus);
  const effectiveError = (job: JobRow | undefined): string | null =>
    !job ? null : isStale(job) ? "任务已中断（应用关闭或崩溃）" : job.error;

  const toJob = (row: JobRow) => ({
    id: row.id,
    trackId: row.track_id,
    status: effectiveStatus(row) ?? "failed",
    progress: row.progress,
    message: row.message,
    error: effectiveError(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const toDetail = (db: AppDb, track: TrackRow): X66CCFFTrackDetail => {
    const stems = db
      .all<StemRow>("stem", { track_id: track.id })
      .sort((a, b) => STEM_ORDER.indexOf(a.kind as StemKind) - STEM_ORDER.indexOf(b.kind as StemKind));
    const job = latestJob(db, track.id);
    return {
      id: track.id,
      title: track.title,
      file: track.file,
      ext: track.ext,
      size: track.size,
      duration: track.duration,
      createdAt: track.created_at,
      stemCount: stems.length,
      jobStatus: effectiveStatus(job),
      jobProgress: job ? job.progress : null,
      jobError: effectiveError(job),
      stems: stems.map((stem) => ({ kind: stem.kind as StemKind, file: stem.file, size: stem.size })),
      job: job ? toJob(job) : null,
    };
  };

  return {
    id: "66CCFF",
    name: "纯蓝",
    owns: ["track", "job", "stem"],

    migrations: [
      {
        id: "0001_init",
        up: (ctx) => {
          ctx.createTable(
            "track",
            [
              "id TEXT PRIMARY KEY",
              "title TEXT NOT NULL",
              "file TEXT NOT NULL",
              "ext TEXT NOT NULL",
              "size INTEGER NOT NULL",
              "duration REAL NOT NULL DEFAULT 0",
              "created_at INTEGER NOT NULL",
            ].join(", "),
          );
          ctx.createTable(
            "job",
            [
              "id TEXT PRIMARY KEY",
              "track_id TEXT NOT NULL",
              "status TEXT NOT NULL",
              "progress REAL NOT NULL DEFAULT 0",
              "message TEXT NOT NULL DEFAULT ''",
              "error TEXT",
              "created_at INTEGER NOT NULL",
              "updated_at INTEGER NOT NULL",
            ].join(", "),
          );
          ctx.createTable(
            "stem",
            [
              "id TEXT PRIMARY KEY",
              "track_id TEXT NOT NULL",
              "job_id TEXT NOT NULL",
              "kind TEXT NOT NULL",
              "file TEXT NOT NULL",
              "size INTEGER NOT NULL",
              "created_at INTEGER NOT NULL",
            ].join(", "),
          );
          ctx.createIndex("track_created", "track", "created_at");
          ctx.createIndex("job_track", "job", "track_id");
          ctx.createIndex("stem_track", "stem", "track_id");
        },
      },
    ],

    api: {
      listTracks: defineRead(ListTracksInput, (ctx) => {
        const tracks = ctx.db.all<TrackRow>("track", {}, { orderBy: "created_at DESC" });
        if (tracks.length === 0) return [];
        const jobs = ctx.db.all<JobRow>("job", {});
        const stems = ctx.db.all<StemRow>("stem", {});
        const latest = new Map<string, JobRow>();
        for (const job of jobs) {
          const prev = latest.get(job.track_id);
          if (!prev || job.updated_at >= prev.updated_at) latest.set(job.track_id, job);
        }
        const counts = new Map<string, number>();
        for (const stem of stems) counts.set(stem.track_id, (counts.get(stem.track_id) ?? 0) + 1);
        return tracks.map((track) => {
          const job = latest.get(track.id);
          return {
            id: track.id,
            title: track.title,
            file: track.file,
            ext: track.ext,
            size: track.size,
            duration: track.duration,
            createdAt: track.created_at,
            stemCount: counts.get(track.id) ?? 0,
            jobStatus: effectiveStatus(job),
            jobProgress: job ? job.progress : null,
            jobError: effectiveError(job),
          };
        });
      }),

      getTrack: defineRead(GetTrackInput, (ctx, input) => {
        const track = getTrackOrThrow(ctx.db, input.trackId);
        return toDetail(ctx.db, track);
      }),

      /** 读取一个本地 MIDI 文件，转成钢琴卷帘需要的秒制音符数据。 */
      readMidi: defineRead(ReadMidiInput, (_ctx, input) => {
        const file = resolve(input.path);
        const ext = extname(file).toLowerCase();
        if (ext !== ".mid" && ext !== ".midi") {
          throw new KernelError("VALIDATION", "只支持 .mid / .midi 文件");
        }
        if (!existsSync(file) || !statSync(file).isFile()) {
          throw new KernelError("VALIDATION", "MIDI 文件不存在");
        }
        const size = statSync(file).size;
        if (size > MAX_MIDI_BYTES) {
          throw new KernelError("VALIDATION", "MIDI 文件过大（上限 10MB）");
        }
        let midi: Midi;
        try {
          midi = new Midi(readFileSync(file));
        } catch {
          throw new KernelError("VALIDATION", "无法解析 MIDI 文件");
        }
        return {
          name: basename(file),
          duration: midi.duration,
          tracks: midi.tracks
            .map((track, index) => ({
              index,
              name: track.name || track.instrument?.name || `Track ${index + 1}`,
              instrument: track.instrument?.name ?? null,
              notes: track.notes.map((note) => ({
                time: note.time,
                duration: note.duration,
                midi: note.midi,
                velocity: note.velocity,
              })),
            }))
            .filter((track) => track.notes.length > 0),
        };
      }),

      getEngineStatus: defineRead(EngineStatusInput, () => {
        const python = enginePython(engine);
        const setupCommand = engineSetupCommand();
        const output: z.infer<typeof EngineStatusOutput> = {
          ready: python !== null,
          engineDir: engine,
          pythonPath: python,
          setupCommand,
          message: python
            ? "引擎已安装；首次分离会自动下载模型"
            : `引擎未安装：请运行 ${setupCommand}`,
        };
        return output;
      }),

      /**
       * 导入音频：慢操作（复制 + 探测）在异步 API 里，最后用事务写入。
       * 只接受常见音频扩展名；文件复制到应用私有目录。
       */
      importTrack: defineAsync(ImportTrackInput, async (ctx, input) => {
        const source = resolve(input.path);
        if (!existsSync(source) || !statSync(source).isFile()) {
          throw new KernelError("VALIDATION", "文件不存在");
        }
        const ext = extname(source).toLowerCase();
        if (!AUDIO_EXTENSIONS.has(ext)) {
          throw new KernelError("VALIDATION", `不支持的音频格式：${ext || "（无扩展名）"}`);
        }
        const stat = statSync(source);
        const id = randomUUID();
        const dir = join(base, "tracks", id);
        const dest = join(dir, `source${ext}`);
        mkdirSync(dir, { recursive: true });
        try {
          copyFileSync(source, dest);
          const duration = probeDuration(source);
          const title = input.title?.trim() || basename(source, extname(source)).trim() || "未命名曲目";
          await ctx.call("66CCFF.insertTrack", {
            id,
            title,
            file: rel(dest),
            ext: ext.slice(1),
            size: stat.size,
            duration,
          });
          const row = ctx.db.get<TrackRow>("track", { id });
          if (!row) throw new KernelError("INTERNAL", "曲目写入失败");
          return toDetail(ctx.db, row);
        } catch (error) {
          rmSync(dir, { recursive: true, force: true });
          throw error;
        }
      }),

      /**
       * 六轨分离（普通异步函数）：创建任务 → 运行 BS-RoFormer → 进度事件 → 事务写六轨。
       * 前端用 runId 订阅事件、用 cancel(runId) 取消。
       */
      startSeparation: defineAsync(StartSeparationInput, async (ctx, input) => {
        const track = getTrackOrThrow(ctx.db, input.trackId);
        if (!enginePython(engine)) {
          throw new KernelError("PRECONDITION", "分离引擎未安装（见引擎状态）");
        }
        const running = ctx.db.get<JobRow>("job", { track_id: track.id, status: "running" });
        if (running) {
          if (!isStale(running)) throw new KernelError("PRECONDITION", "这首曲目正在分离");
          await ctx.call("66CCFF.updateJob", {
            jobId: running.id,
            patch: { status: "failed", error: "任务已中断（应用关闭或崩溃）" },
          });
        }
        const jobId = randomUUID();
        await ctx.call("66CCFF.insertJob", { id: jobId, trackId: track.id });
        const workDir = join(base, "jobs", jobId);
        let lastMessage = "准备中";
        let lastWrite = 0;

        const onProgress = (progress: number, message: string) => {
          lastMessage = message;
          ctx.emit({ type: "progress", progress, message });
          const now = Date.now();
          if (now - lastWrite < 800) return;
          lastWrite = now;
          void ctx
            .call("66CCFF.updateJob", { jobId, patch: { progress, message } })
            .catch(() => undefined);
        };

        try {
          mkdirSync(workDir, { recursive: true });
          const files = await runSeparation({
            engineDir: engine,
            input: abs(track.file),
            outputDir: workDir,
            signal: ctx.signal,
            onProgress,
          });
          const jobStemsDir = join(base, "tracks", track.id, `stems-${jobId}`);
          mkdirSync(jobStemsDir, { recursive: true });
          const stems: Array<{ kind: StemKind; file: string; size: number }> = [];
          for (const kind of STEM_ORDER) {
            const sourceFile = files[kind];
            if (!sourceFile) continue;
            const dest = join(jobStemsDir, `${kind}.flac`);
            copyFileSync(sourceFile, dest);
            stems.push({ kind, file: rel(dest), size: statSync(dest).size });
          }
          if (stems.length === 0) throw new KernelError("INTERNAL", "没有生成任何轨道");
          await ctx.call("66CCFF.finishJob", { jobId, trackId: track.id, stems });
          // 成功切换引用后再清理旧分轨目录；清理失败只会留下孤儿目录（允许）
          try {
            for (const entry of readdirSync(join(base, "tracks", track.id), { withFileTypes: true })) {
              if (
                entry.isDirectory() &&
                entry.name.startsWith("stems-") &&
                entry.name !== `stems-${jobId}`
              ) {
                rmSync(join(base, "tracks", track.id, entry.name), { recursive: true, force: true });
              }
            }
          } catch {
            /* 旧目录清理失败不影响分离结果 */
          }
          rmSync(workDir, { recursive: true, force: true });
          return { jobId, stems: stems.map((stem) => stem.kind) };
        } catch (error) {
          const aborted = ctx.signal.aborted;
          const message = error instanceof Error ? error.message : String(error);
          try {
            await ctx.call("66CCFF.updateJob", {
              jobId,
              patch: {
                status: aborted ? "cancelled" : "failed",
                message: lastMessage,
                error: message,
              },
            });
          } catch {
            /* 任务记录更新失败时不掩盖原始错误 */
          }
          rmSync(workDir, { recursive: true, force: true });
          rmSync(join(base, "tracks", track.id, `stems-${jobId}`), { recursive: true, force: true });
          if (aborted) throw new KernelError("ABORTED", "分离已取消");
          throw error;
        }
      }),

      deleteTrack: defineAsync(DeleteTrackInput, async (ctx, input) => {
        const track = getTrackOrThrow(ctx.db, input.trackId);
        const running = ctx.db.get<JobRow>("job", { track_id: track.id, status: "running" });
        if (running) {
          if (!isStale(running)) throw new KernelError("PRECONDITION", "分离进行中，不能删除");
          await ctx.call("66CCFF.updateJob", {
            jobId: running.id,
            patch: { status: "failed", error: "任务已中断（应用关闭或崩溃）" },
          });
        }
        await ctx.call("66CCFF.deleteTrackTx", { trackId: track.id });
        rmSync(join(base, "tracks", track.id), { recursive: true, force: true });
        return { ok: true as const };
      }),

      // —— 内部事务 API（供普通异步函数使用；也可被本应用前端调用） ——

      insertTrack: defineTx(InsertTrackInput, (ctx, input) => {
        ctx.db.insert("track", {
          id: input.id,
          title: input.title,
          file: input.file,
          ext: input.ext,
          size: input.size,
          duration: input.duration,
          created_at: Date.now(),
        });
        return { ok: true as const };
      }),

      insertJob: defineTx(InsertJobInput, (ctx, input) => {
        const now = Date.now();
        ctx.db.insert("job", {
          id: input.id,
          track_id: input.trackId,
          status: "running",
          progress: 0,
          message: "准备中",
          error: null,
          created_at: now,
          updated_at: now,
        });
        return { ok: true as const };
      }),

      updateJob: defineTx(UpdateJobInput, (ctx, input) => {
        const job = ctx.db.get<JobRow>("job", { id: input.jobId });
        if (!job) throw new KernelError("NOT_FOUND", `任务不存在：${input.jobId}`);
        const patch: Record<string, SqlValue> = { updated_at: Date.now() };
        if (input.patch.status !== undefined) patch.status = input.patch.status;
        if (input.patch.progress !== undefined) {
          patch.progress = Math.max(0, Math.min(1, input.patch.progress));
        }
        if (input.patch.message !== undefined) patch.message = input.patch.message.slice(0, 500);
        if (input.patch.error !== undefined) {
          patch.error = input.patch.error ? input.patch.error.slice(0, 2000) : null;
        }
        ctx.db.update("job", patch, { id: input.jobId });
        return { ok: true as const };
      }),

      finishJob: defineTx(FinishJobInput, (ctx, input) => {
        const job = ctx.db.get<JobRow>("job", { id: input.jobId });
        if (!job) throw new KernelError("NOT_FOUND", `任务不存在：${input.jobId}`);
        ctx.db.delete("stem", { track_id: input.trackId });
        const now = Date.now();
        for (const stem of input.stems) {
          ctx.db.insert("stem", {
            id: randomUUID(),
            track_id: input.trackId,
            job_id: input.jobId,
            kind: stem.kind,
            file: stem.file,
            size: stem.size,
            created_at: now,
          });
        }
        ctx.db.update(
          "job",
          { status: "succeeded", progress: 1, message: "完成", error: null, updated_at: now },
          { id: input.jobId },
        );
        return { ok: true as const };
      }),

      deleteTrackTx: defineTx(DeleteTrackTxInput, (ctx, input) => {
        getTrackOrThrow(ctx.db, input.trackId);
        ctx.db.delete("stem", { track_id: input.trackId });
        ctx.db.delete("job", { track_id: input.trackId });
        ctx.db.delete("track", { id: input.trackId });
        return { ok: true as const };
      }),
    },
  };
}
