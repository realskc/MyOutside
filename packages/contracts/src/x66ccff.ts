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

export const X66CCFFTrackDetailSchema = X66CCFFTrackSchema.extend({
  stems: z.array(X66CCFFStemSchema),
  job: X66CCFFJobSchema.nullable(),
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

export interface X66CCFFApi {
  "66CCFF.listTracks": { input: ListTracksInput; output: X66CCFFTrack[] };
  "66CCFF.getTrack": { input: GetTrackInput; output: X66CCFFTrackDetail };
  "66CCFF.importTrack": { input: ImportTrackInput; output: X66CCFFTrack };
  "66CCFF.startSeparation": { input: StartSeparationInput; output: StartSeparationOutput };
  "66CCFF.deleteTrack": { input: DeleteTrackInput; output: { ok: true } };
  "66CCFF.getEngineStatus": { input: EngineStatusInput; output: EngineStatusOutput };
}
