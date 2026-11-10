import { z } from "zod";

/** 六轨类型（Demucs htdemucs_6s 的输出） */
export const X66CCFFStemKind = z.enum(["vocals", "drums", "bass", "other", "guitar", "piano"]);
export type X66CCFFStemKind = z.infer<typeof X66CCFFStemKind>;

export const X66CCFFJobStatus = z.enum(["running", "succeeded", "failed", "cancelled"]);
export type X66CCFFJobStatus = z.infer<typeof X66CCFFJobStatus>;

export const X66CCFFJobSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  status: X66CCFFJobStatus,
  progress: z.number(),
  message: z.string(),
  error: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type X66CCFFJob = z.infer<typeof X66CCFFJobSchema>;

export const X66CCFFStemSchema = z.object({
  kind: X66CCFFStemKind,
  /** 相对应用文件根；界面拼成 media://66ccff/<file> */
  file: z.string(),
  size: z.number().int(),
});
export type X66CCFFStem = z.infer<typeof X66CCFFStemSchema>;

export const X66CCFFTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  file: z.string(),
  ext: z.string(),
  size: z.number().int(),
  duration: z.number(),
  createdAt: z.number().int(),
  stemCount: z.number().int(),
  jobStatus: X66CCFFJobStatus.nullable(),
  jobProgress: z.number().nullable(),
  jobError: z.string().nullable(),
});
export type X66CCFFTrack = z.infer<typeof X66CCFFTrackSchema>;

/**
 * 转 MIDI 的引擎（66CCFF-0017）：MuScriptor（多种乐器，66CCFF-0012）；GAME（只转人声旋律，单旋律）。
 * 记录里不单独存，从 model 看出来：GAME 的 model 以 `game-` 开头。
 */
export const X66CCFFTranscriptionEngine = z.enum(["muscriptor", "game"]);
export type X66CCFFTranscriptionEngine = z.infer<typeof X66CCFFTranscriptionEngine>;

/** 一次转 MIDI（66CCFF-0012）：所选的 stem → 一个引擎、一个乐器 → 一个单轨 MIDI */
export const X66CCFFTranscriptionSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  stems: z.array(X66CCFFStemKind),
  engine: X66CCFFTranscriptionEngine,
  /** MuScriptor 的乐器组名，例如 acoustic_piano；GAME 固定是 voice */
  instrument: z.string(),
  /** MuScriptor 是权重大小（medium）；GAME 是 game-large */
  model: z.string(),
  status: X66CCFFJobStatus,
  progress: z.number(),
  message: z.string(),
  error: z.string().nullable(),
  /** 相对应用文件根；成功后才有 */
  file: z.string().nullable(),
  noteCount: z.number().int().nullable(),
  bpm: z.number().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type X66CCFFTranscription = z.infer<typeof X66CCFFTranscriptionSchema>;

export const X66CCFFTrackDetailSchema = X66CCFFTrackSchema.extend({
  stems: z.array(X66CCFFStemSchema),
  job: X66CCFFJobSchema.nullable(),
  /** 新的在前 */
  transcriptions: z.array(X66CCFFTranscriptionSchema),
});
export type X66CCFFTrackDetail = z.infer<typeof X66CCFFTrackDetailSchema>;

export const ListTracksInput = z.object({});
export type ListTracksInput = z.infer<typeof ListTracksInput>;

export const GetTrackInput = z.object({ trackId: z.string() });
export type GetTrackInput = z.infer<typeof GetTrackInput>;

export const ImportTrackInput = z.object({ path: z.string().min(1), title: z.string().optional() });
export type ImportTrackInput = z.infer<typeof ImportTrackInput>;

export const StartSeparationInput = z.object({ trackId: z.string() });
export type StartSeparationInput = z.infer<typeof StartSeparationInput>;

export const StartSeparationOutput = z.object({
  jobId: z.string(),
  stems: z.array(X66CCFFStemKind),
});
export type StartSeparationOutput = z.infer<typeof StartSeparationOutput>;

export const DeleteTrackInput = z.object({ trackId: z.string() });
export type DeleteTrackInput = z.infer<typeof DeleteTrackInput>;

export const StartTranscriptionInput = z.object({
  trackId: z.string(),
  stems: z.array(X66CCFFStemKind).min(1),
  engine: X66CCFFTranscriptionEngine.default("muscriptor"),
  /** GAME 只接受 voice */
  instrument: z.string().min(1),
});
export type StartTranscriptionInput = z.infer<typeof StartTranscriptionInput>;

export const StartTranscriptionOutput = z.object({ transcriptionId: z.string(), noteCount: z.number().int() });
export type StartTranscriptionOutput = z.infer<typeof StartTranscriptionOutput>;

export const TranscriptionIdInput = z.object({ transcriptionId: z.string() });
export type TranscriptionIdInput = z.infer<typeof TranscriptionIdInput>;

/** 钢琴卷帘用的秒制音符数据（readMidi / readTranscription） */
export const X66CCFFMidiDataSchema = z.object({
  name: z.string(),
  duration: z.number(),
  /** 拍和小节线的时间（秒），按 MIDI 的速度表算；没有拍号时按 4/4（66CCFF-0015） */
  grid: z.object({ beats: z.array(z.number()), bars: z.array(z.number()) }),
  tracks: z.array(
    z.object({
      index: z.number().int(),
      name: z.string(),
      instrument: z.string().nullable(),
      /** 鼓轨（MIDI 第 10 通道）：音高代表鼓件，不是音高 */
      percussion: z.boolean(),
      notes: z.array(z.object({ time: z.number(), duration: z.number(), midi: z.number().int(), velocity: z.number() })),
    }),
  ),
});
export type X66CCFFMidiData = z.infer<typeof X66CCFFMidiDataSchema>;

export const EngineStatusInput = z.object({});
export type EngineStatusInput = z.infer<typeof EngineStatusInput>;

export const EngineStatusOutput = z.object({
  ready: z.boolean(),
  engineDir: z.string(),
  pythonPath: z.string().nullable(),
  setupCommand: z.string(),
  message: z.string(),
});
export type EngineStatusOutput = z.infer<typeof EngineStatusOutput>;

export const TranscriptionEngineStatusOutput = z.object({
  /** 已安装且已登录 HuggingFace */
  ready: z.boolean(),
  installed: z.boolean(),
  loggedIn: z.boolean(),
  engineDir: z.string(),
  setupCommand: z.string(),
  /** 在终端里运行；token 只在终端里输入，不经过 MyOutside */
  loginCommand: z.string(),
  instruments: z.array(z.string()),
  message: z.string(),
  /** 人声旋律用的 GAME（66CCFF-0017）；不用登录 */
  game: z.object({
    ready: z.boolean(),
    engineDir: z.string(),
    setupCommand: z.string(),
    message: z.string(),
  }),
});
export type TranscriptionEngineStatusOutput = z.infer<typeof TranscriptionEngineStatusOutput>;

export interface X66CCFFApi {
  "66CCFF.listTracks": { input: ListTracksInput; output: X66CCFFTrack[] };
  "66CCFF.getTrack": { input: GetTrackInput; output: X66CCFFTrackDetail };
  "66CCFF.importTrack": { input: ImportTrackInput; output: X66CCFFTrack };
  "66CCFF.startSeparation": { input: StartSeparationInput; output: StartSeparationOutput };
  "66CCFF.deleteTrack": { input: DeleteTrackInput; output: { ok: true } };
  "66CCFF.getEngineStatus": { input: EngineStatusInput; output: EngineStatusOutput };
  "66CCFF.getTranscriptionEngineStatus": { input: EngineStatusInput; output: TranscriptionEngineStatusOutput };
  "66CCFF.startTranscription": { input: StartTranscriptionInput; output: StartTranscriptionOutput };
  "66CCFF.readTranscription": { input: TranscriptionIdInput; output: X66CCFFMidiData };
  "66CCFF.deleteTranscription": { input: TranscriptionIdInput; output: { ok: true } };
}
