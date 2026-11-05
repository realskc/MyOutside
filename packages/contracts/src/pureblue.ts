import { z } from "zod";

/** 六轨类型（Demucs htdemucs_6s 的输出） */
export const PureblueStemKind = z.enum(["vocals", "drums", "bass", "other", "guitar", "piano"]);
export type PureblueStemKind = z.infer<typeof PureblueStemKind>;

export const PureblueJobStatus = z.enum(["running", "succeeded", "failed", "cancelled"]);
export type PureblueJobStatus = z.infer<typeof PureblueJobStatus>;

export const PureblueJobSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  status: PureblueJobStatus,
  progress: z.number(),
  message: z.string(),
  error: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type PureblueJob = z.infer<typeof PureblueJobSchema>;

export const PureblueStemSchema = z.object({
  kind: PureblueStemKind,
  /** 相对应用文件根；界面拼成 media://pureblue/<file> */
  file: z.string(),
  size: z.number().int(),
});
export type PureblueStem = z.infer<typeof PureblueStemSchema>;

export const PureblueTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  file: z.string(),
  ext: z.string(),
  size: z.number().int(),
  duration: z.number(),
  createdAt: z.number().int(),
  stemCount: z.number().int(),
  jobStatus: PureblueJobStatus.nullable(),
  jobProgress: z.number().nullable(),
  jobError: z.string().nullable(),
});
export type PureblueTrack = z.infer<typeof PureblueTrackSchema>;

export const PureblueTrackDetailSchema = PureblueTrackSchema.extend({
  stems: z.array(PureblueStemSchema),
  job: PureblueJobSchema.nullable(),
});
export type PureblueTrackDetail = z.infer<typeof PureblueTrackDetailSchema>;

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
  stems: z.array(PureblueStemKind),
});
export type StartSeparationOutput = z.infer<typeof StartSeparationOutput>;

export const DeleteTrackInput = z.object({ trackId: z.string() });
export type DeleteTrackInput = z.infer<typeof DeleteTrackInput>;

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

export interface PureblueApi {
  "pureblue.listTracks": { input: ListTracksInput; output: PureblueTrack[] };
  "pureblue.getTrack": { input: GetTrackInput; output: PureblueTrackDetail };
  "pureblue.importTrack": { input: ImportTrackInput; output: PureblueTrack };
  "pureblue.startSeparation": { input: StartSeparationInput; output: StartSeparationOutput };
  "pureblue.deleteTrack": { input: DeleteTrackInput; output: { ok: true } };
  "pureblue.getEngineStatus": { input: EngineStatusInput; output: EngineStatusOutput };
}
