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
  StartTranscriptionInput,
  TranscriptionEngineStatusOutput,
  TranscriptionIdInput,
  type X66CCFFJobStatus,
  type X66CCFFMidiData,
  type X66CCFFStemKind as StemKind,
  type X66CCFFTrackDetail,
  type X66CCFFTranscription,
} from "@myoutside/contracts";
import {
  definePlain,
  defineRead,
  defineTx,
  KernelError,
  type AppDb,
  type AppModule,
  type PlainContext,
  type SqlValue,
} from "@myoutside/kernel";
import { Midi } from "@tonejs/midi";
import { z } from "zod";
import { findMediaTool } from "./media.js";
import { enginePython } from "./process.js";
import { runSeparation } from "./roformer.js";
import {
  engineOfModel,
  GAME_MODEL,
  gameInstalled,
  huggingFaceLoggedIn,
  MUSCRIPTOR_INSTRUMENTS,
  runTranscription,
} from "./transcription.js";

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

const InsertTranscriptionInput = z.object({
  id: z.string(),
  trackId: z.string(),
  stems: z.array(X66CCFFStemKind),
  instrument: z.string(),
  model: z.string(),
});

const UpdateTranscriptionInput = z.object({
  transcriptionId: z.string(),
  patch: z.object({
    status: z.enum(["running", "succeeded", "failed", "cancelled"]).optional(),
    progress: z.number().optional(),
    message: z.string().optional(),
    error: z.string().nullable().optional(),
  }),
});

const FinishTranscriptionInput = z.object({
  transcriptionId: z.string(),
  file: z.string(),
  noteCount: z.number().int(),
  bpm: z.number().nullable(),
});

/** MuScriptor 的模型大小：medium 是它的默认值，ThinkBook 上试过、效果好（66CCFF-0012） */
const TRANSCRIPTION_MODEL = "medium";
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

interface TranscriptionRow {
  id: string;
  track_id: string;
  stems: string;
  instrument: string;
  model: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
  file: string | null;
  note_count: number | null;
  bpm: number | null;
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
  /** MuScriptor 转写引擎目录；默认 dataDir/muscriptor-engine（66CCFF-0012） */
  transcriptionEngineDir?: string;
  /** GAME 人声转 MIDI 引擎目录；默认 dataDir/game-engine（66CCFF-0017） */
  gameEngineDir?: string;
  /** 仓库里的 apps/66CCFF/scripts（转写包装脚本在这里）；不给就不能转写 */
  scriptsDir?: string;
}

/** 各平台的引擎安装命令；UI 的“引擎未安装”提示直接展示它。 */
function engineSetupCommand(): string {
  if (process.platform === "darwin") return "bash apps/66CCFF/scripts/setup-engine-macos.sh";
  if (process.platform === "win32") {
    return "powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-engine.ps1";
  }
  return "请参考 apps/66CCFF/docs/README.md 手动安装分离引擎";
}

function transcriptionSetupCommand(): string {
  if (process.platform === "darwin") return "bash apps/66CCFF/scripts/setup-muscriptor-macos.sh";
  if (process.platform === "win32") {
    return "powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-muscriptor.ps1";
  }
  return "请参考 apps/66CCFF/docs/README.md 手动安装转写引擎";
}

function gameSetupCommand(): string {
  if (process.platform === "darwin") return "bash apps/66CCFF/scripts/setup-game-macos.sh";
  if (process.platform === "win32") {
    return "powershell -ExecutionPolicy Bypass -File apps/66CCFF/scripts/setup-game.ps1";
  }
  return "请参考 apps/66CCFF/docs/README.md 手动安装 GAME";
}

/** 登录 HuggingFace（MuScriptor 的权重需要）：用转写引擎自带的 hf 命令，token 只在终端里输入 */
function transcriptionLoginCommand(engine: string): string {
  return process.platform === "win32"
    ? `& "${join(engine, "venv", "Scripts", "hf.exe")}" auth login`
    : `"${join(engine, "venv", "bin", "hf")}" auth login`;
}

/**
 * MIDI 的拍和小节线（秒）：按速度表把每一拍的 tick 换成秒；没有拍号时按 4/4，从 tick 0 起算（和 GarageBand 等软件一致）。
 * 最多算 20000 拍，防止异常文件。
 */
function midiGrid(midi: Midi): { beats: number[]; bars: number[] } {
  const ppq = midi.header.ppq || 480;
  const signatures = midi.header.timeSignatures.length
    ? [...midi.header.timeSignatures].sort((a, b) => a.ticks - b.ticks)
    : [{ ticks: 0, timeSignature: [4, 4] }];
  const endTick = midi.durationTicks;
  const beats: number[] = [];
  const bars: number[] = [];
  let tick = 0;
  let index = 0;
  let beatInBar = 0;
  while (tick <= endTick && beats.length < 20000) {
    while (index + 1 < signatures.length && signatures[index + 1]!.ticks <= tick) {
      index += 1;
      beatInBar = 0;
    }
    const [numerator = 4, denominator = 4] = signatures[index]!.timeSignature;
    const seconds = midi.header.ticksToSeconds(tick);
    beats.push(seconds);
    if (beatInBar === 0) bars.push(seconds);
    beatInBar = (beatInBar + 1) % Math.max(1, numerator);
    tick += (ppq * 4) / Math.max(1, denominator);
  }
  return { beats, bars };
}

const MUSCRIPTOR_BAR_OFFSET = "muscriptor:bar_offset=";

/**
 * MuScriptor 写的 MIDI 里，音符整体延后了几百毫秒：MIDI 没有弱起小节，为了让第一个强拍落在小节线上，
 * 它把整段音乐往后推，并在第一轨记一个 marker `muscriptor:bar_offset=<秒>`（原音频从 MIDI 的这个时间开始）。
 * 纯蓝要拿 MIDI 和分轨对齐，读的时候要把它减回去（66CCFF-0016）。
 */
function audioOffset(midi: Midi): number {
  for (const event of midi.header.meta) {
    if (event.type !== "marker" || !event.text.startsWith(MUSCRIPTOR_BAR_OFFSET)) continue;
    const value = Number(event.text.slice(MUSCRIPTOR_BAR_OFFSET.length));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

/** 解析 MIDI 文件，转成钢琴卷帘需要的秒制音符数据；时间都是原音频的时间（66CCFF-0016） */
function parseMidiFile(file: string, name: string): X66CCFFMidiData {
  let midi: Midi;
  try {
    midi = new Midi(readFileSync(file));
  } catch {
    throw new KernelError("VALIDATION", "无法解析 MIDI 文件");
  }
  const offset = audioOffset(midi);
  const grid = midiGrid(midi);
  return {
    name,
    duration: Math.max(0, midi.duration - offset),
    grid: { beats: grid.beats.map((time) => time - offset), bars: grid.bars.map((time) => time - offset) },
    tracks: midi.tracks
      .map((track, index) => ({
        index,
        name: track.name || track.instrument?.name || `Track ${index + 1}`,
        instrument: track.instrument?.name ?? null,
        percussion: track.instrument?.percussion ?? false,
        notes: track.notes.map((note) => ({
          time: note.time - offset,
          duration: note.duration,
          midi: note.midi,
          velocity: note.velocity,
        })),
      }))
      .filter((track) => track.notes.length > 0),
  };
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
  transcriptionEngineDir = join(dataDir, "muscriptor-engine"),
  gameEngineDir = join(dataDir, "game-engine"),
  scriptsDir,
}: X66CCFFAppOptions): AppModule {
  const base = resolve(dataDir);
  const engine = resolve(engineDir);
  const transcriptionEngine = resolve(transcriptionEngineDir);
  const transcriptionScript = scriptsDir ? join(resolve(scriptsDir), "transcribe_muscriptor.py") : null;
  const gameEngine = resolve(gameEngineDir);
  const gameScript = scriptsDir ? join(resolve(scriptsDir), "transcribe_game.py") : null;

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

  const isStaleTranscription = (row: TranscriptionRow): boolean =>
    row.status === "running" && Date.now() - row.updated_at > STALE_JOB_MS;

  const toTranscription = (row: TranscriptionRow): X66CCFFTranscription => ({
    id: row.id,
    trackId: row.track_id,
    stems: JSON.parse(row.stems) as StemKind[],
    engine: engineOfModel(row.model),
    instrument: row.instrument,
    model: row.model,
    status: isStaleTranscription(row) ? "failed" : (row.status as X66CCFFJobStatus),
    progress: row.progress,
    message: row.message,
    error: isStaleTranscription(row) ? "任务已中断（应用关闭或崩溃）" : row.error,
    file: row.file,
    noteCount: row.note_count,
    bpm: row.bpm,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  /** 这首曲目有没有正在跑（且不是遗留）的转写 */
  const runningTranscription = (db: AppDb, trackId: string): TranscriptionRow | undefined =>
    db
      .all<TranscriptionRow>("transcription", { track_id: trackId, status: "running" })
      .find((row) => !isStaleTranscription(row));

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
      transcriptions: db
        .all<TranscriptionRow>("transcription", { track_id: track.id }, { orderBy: "created_at DESC" })
        .map(toTranscription),
    };
  };

  return {
    id: "66CCFF",
    name: "纯蓝",
    owns: ["track", "job", "stem", "transcription"],

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
      {
        // 转 MIDI 的记录（66CCFF-0012）
        id: "0002_transcription",
        up: (ctx) => {
          ctx.createTable(
            "transcription",
            [
              "id TEXT PRIMARY KEY",
              "track_id TEXT NOT NULL",
              "stems TEXT NOT NULL", // JSON：所选的 stem
              "instrument TEXT NOT NULL",
              "model TEXT NOT NULL",
              "status TEXT NOT NULL",
              "progress REAL NOT NULL DEFAULT 0",
              "message TEXT NOT NULL DEFAULT ''",
              "error TEXT",
              "file TEXT", // 相对应用文件根；成功后才有
              "note_count INTEGER",
              "bpm REAL",
              "created_at INTEGER NOT NULL",
              "updated_at INTEGER NOT NULL",
            ].join(", "),
          );
          ctx.createIndex("transcription_track", "transcription", "track_id");
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
        return parseMidiFile(file, basename(file));
      }),

      /** 读取一次转写的结果，格式同 readMidi */
      readTranscription: defineRead(TranscriptionIdInput, (ctx, input) => {
        const row = ctx.db.get<TranscriptionRow>("transcription", { id: input.transcriptionId });
        if (!row) throw new KernelError("NOT_FOUND", `转写记录不存在：${input.transcriptionId}`);
        if (!row.file) throw new KernelError("PRECONDITION", "这次转写还没有结果");
        const file = abs(row.file);
        if (!existsSync(file)) throw new KernelError("NOT_FOUND", "MIDI 文件不见了");
        const track = ctx.db.get<TrackRow>("track", { id: row.track_id });
        return parseMidiFile(file, `${track?.title ?? "MIDI"} · ${row.instrument}`);
      }),

      getTranscriptionEngineStatus: defineRead(EngineStatusInput, () => {
        const installed = enginePython(transcriptionEngine) !== null && transcriptionScript !== null;
        const loggedIn = huggingFaceLoggedIn();
        const setupCommand = transcriptionSetupCommand();
        const loginCommand = transcriptionLoginCommand(transcriptionEngine);
        const output: z.infer<typeof TranscriptionEngineStatusOutput> = {
          ready: installed && loggedIn,
          installed,
          loggedIn,
          engineDir: transcriptionEngine,
          setupCommand,
          loginCommand,
          instruments: [...MUSCRIPTOR_INSTRUMENTS],
          message: !installed
            ? `转写引擎未安装：请运行 ${setupCommand}`
            : !loggedIn
              ? `MuScriptor 的权重需要先登录 HuggingFace：在终端运行 ${loginCommand}`
              : "转写引擎已就绪；第一次转写会自动下载模型",
          game: {
            ready: gameInstalled(gameEngine) && gameScript !== null,
            engineDir: gameEngine,
            setupCommand: gameSetupCommand(),
            message:
              gameInstalled(gameEngine) && gameScript !== null
                ? "GAME 已就绪"
                : `GAME 未安装：请运行 ${gameSetupCommand()}`,
          },
        };
        return output;
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
      importTrack: definePlain(ImportTrackInput, async (ctx, input) => {
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
      startSeparation: definePlain(StartSeparationInput, async (ctx, input) => {
        const track = getTrackOrThrow(ctx.db, input.trackId);
        // 重新分离会换掉分轨文件，正在转写的会读到被删掉的文件
        if (runningTranscription(ctx.db, track.id)) throw new KernelError("PRECONDITION", "这首曲目正在转 MIDI");
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

      /**
       * 转 MIDI（普通异步函数，66CCFF-0012）：所选 stem（几条就先混成一条）→ MuScriptor（只允许一个乐器）→ 单轨 MIDI，
       * 存到 tracks/<id>/midi/<转写 id>.mid。进度经事件和记录两条路给界面；前端用 runId 取消。
       */
      startTranscription: definePlain(StartTranscriptionInput, async (ctx, input) => {
        const track = getTrackOrThrow(ctx.db, input.trackId);
        const useGame = input.engine === "game";
        let script: string;
        if (useGame) {
          // GAME 只转人声旋律（66CCFF-0017）
          if (input.instrument !== "voice") throw new KernelError("VALIDATION", "GAME 只能转人声");
          if (!gameInstalled(gameEngine) || !gameScript) {
            throw new KernelError("PRECONDITION", `GAME 未安装：请运行 ${gameSetupCommand()}`);
          }
          script = gameScript;
        } else {
          if (!(MUSCRIPTOR_INSTRUMENTS as readonly string[]).includes(input.instrument)) {
            throw new KernelError("VALIDATION", `未知的乐器：${input.instrument}`);
          }
          if (!enginePython(transcriptionEngine) || !transcriptionScript) {
            throw new KernelError("PRECONDITION", `转写引擎未安装：请运行 ${transcriptionSetupCommand()}`);
          }
          if (!huggingFaceLoggedIn()) {
            throw new KernelError(
              "PRECONDITION",
              `MuScriptor 的权重需要先登录 HuggingFace：在终端运行 ${transcriptionLoginCommand(transcriptionEngine)}`,
            );
          }
          script = transcriptionScript;
        }
        const model = useGame ? GAME_MODEL : TRANSCRIPTION_MODEL;
        const job = latestJob(ctx.db, track.id);
        if (job && effectiveStatus(job) === "running") throw new KernelError("PRECONDITION", "这首曲目正在分离");
        if (runningTranscription(ctx.db, track.id)) throw new KernelError("PRECONDITION", "这首曲目正在转 MIDI");
        const stems = ctx.db.all<StemRow>("stem", { track_id: track.id });
        const kinds = [...new Set(input.stems)].sort((a, b) => STEM_ORDER.indexOf(a) - STEM_ORDER.indexOf(b));
        const inputs = kinds.map((kind) => {
          const stem = stems.find((row) => row.kind === kind);
          if (!stem) throw new KernelError("PRECONDITION", `这首曲目没有 ${kind} 轨，请先分离`);
          return abs(stem.file);
        });

        const transcriptionId = randomUUID();
        await ctx.call("66CCFF.insertTranscription", {
          id: transcriptionId,
          trackId: track.id,
          stems: kinds,
          instrument: input.instrument,
          model,
        });
        const workDir = join(base, "jobs", `midi-${transcriptionId}`);
        let lastMessage = "准备中";
        let lastWrite = 0;
        const onProgress = (progress: number, message: string) => {
          lastMessage = message;
          ctx.emit({ type: "progress", progress, message });
          const now = Date.now();
          if (now - lastWrite < 800) return;
          lastWrite = now;
          void ctx
            .call("66CCFF.updateTranscription", { transcriptionId, patch: { progress, message } })
            .catch(() => undefined);
        };

        try {
          // 节拍在整首歌上检测：同一首歌的每次转写都用同一套小节线（66CCFF-0017）
          const source = abs(track.file);
          const result = await runTranscription({
            engine: useGame ? "game" : "muscriptor",
            engineDir: useGame ? gameEngine : transcriptionEngine,
            script,
            inputs,
            beatsAudio: existsSync(source) ? source : null,
            instrument: input.instrument,
            model,
            workDir,
            signal: ctx.signal,
            onProgress,
          });
          const midiDir = join(base, "tracks", track.id, "midi");
          mkdirSync(midiDir, { recursive: true });
          const dest = join(midiDir, `${transcriptionId}.mid`);
          copyFileSync(result.midiFile, dest);
          // 音符数从写好的 MIDI 里数，和卷帘里看到的一致（66CCFF-0014）
          const noteCount = parseMidiFile(dest, "").tracks.reduce((sum, track) => sum + track.notes.length, 0);
          await ctx.call("66CCFF.finishTranscription", {
            transcriptionId,
            file: rel(dest),
            noteCount,
            bpm: result.bpm,
          });
          rmSync(workDir, { recursive: true, force: true });
          return { transcriptionId, noteCount };
        } catch (error) {
          const aborted = ctx.signal.aborted;
          const message = error instanceof Error ? error.message : String(error);
          try {
            await ctx.call("66CCFF.updateTranscription", {
              transcriptionId,
              patch: { status: aborted ? "cancelled" : "failed", message: lastMessage, error: message },
            });
          } catch {
            /* 记录更新失败时不掩盖原始错误 */
          }
          rmSync(workDir, { recursive: true, force: true });
          if (aborted) throw new KernelError("ABORTED", "转写已取消");
          throw error;
        }
      }),

      deleteTranscription: definePlain(TranscriptionIdInput, async (ctx, input) => {
        const row = ctx.db.get<TranscriptionRow>("transcription", { id: input.transcriptionId });
        if (!row) throw new KernelError("NOT_FOUND", `转写记录不存在：${input.transcriptionId}`);
        if (row.status === "running" && !isStaleTranscription(row)) {
          throw new KernelError("PRECONDITION", "转写进行中，先取消");
        }
        await ctx.call("66CCFF.deleteTranscriptionTx", { transcriptionId: row.id });
        if (row.file) rmSync(abs(row.file), { force: true });
        return { ok: true as const };
      }),

      deleteTrack: definePlain(DeleteTrackInput, async (ctx, input) => {
        const track = getTrackOrThrow(ctx.db, input.trackId);
        if (runningTranscription(ctx.db, track.id)) throw new KernelError("PRECONDITION", "转 MIDI 进行中，不能删除");
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

      insertTranscription: defineTx(InsertTranscriptionInput, (ctx, input) => {
        const now = Date.now();
        ctx.db.insert("transcription", {
          id: input.id,
          track_id: input.trackId,
          stems: JSON.stringify(input.stems),
          instrument: input.instrument,
          model: input.model,
          status: "running",
          progress: 0,
          message: "准备中",
          error: null,
          file: null,
          note_count: null,
          bpm: null,
          created_at: now,
          updated_at: now,
        });
        return { ok: true as const };
      }),

      updateTranscription: defineTx(UpdateTranscriptionInput, (ctx, input) => {
        const row = ctx.db.get<TranscriptionRow>("transcription", { id: input.transcriptionId });
        if (!row) throw new KernelError("NOT_FOUND", `转写记录不存在：${input.transcriptionId}`);
        const patch: Record<string, SqlValue> = { updated_at: Date.now() };
        if (input.patch.status !== undefined) patch.status = input.patch.status;
        if (input.patch.progress !== undefined) patch.progress = Math.max(0, Math.min(1, input.patch.progress));
        if (input.patch.message !== undefined) patch.message = input.patch.message.slice(0, 500);
        if (input.patch.error !== undefined) patch.error = input.patch.error ? input.patch.error.slice(0, 2000) : null;
        ctx.db.update("transcription", patch, { id: input.transcriptionId });
        return { ok: true as const };
      }),

      finishTranscription: defineTx(FinishTranscriptionInput, (ctx, input) => {
        const row = ctx.db.get<TranscriptionRow>("transcription", { id: input.transcriptionId });
        if (!row) throw new KernelError("NOT_FOUND", `转写记录不存在：${input.transcriptionId}`);
        ctx.db.update(
          "transcription",
          {
            status: "succeeded",
            progress: 1,
            message: "完成",
            error: null,
            file: input.file,
            note_count: input.noteCount,
            bpm: input.bpm,
            updated_at: Date.now(),
          },
          { id: input.transcriptionId },
        );
        return { ok: true as const };
      }),

      deleteTranscriptionTx: defineTx(TranscriptionIdInput, (ctx, input) => {
        ctx.db.delete("transcription", { id: input.transcriptionId });
        return { ok: true as const };
      }),

      deleteTrackTx: defineTx(DeleteTrackTxInput, (ctx, input) => {
        getTrackOrThrow(ctx.db, input.trackId);
        ctx.db.delete("transcription", { track_id: input.trackId });
        ctx.db.delete("stem", { track_id: input.trackId });
        ctx.db.delete("job", { track_id: input.trackId });
        ctx.db.delete("track", { id: input.trackId });
        return { ok: true as const };
      }),
    },
  };
}
