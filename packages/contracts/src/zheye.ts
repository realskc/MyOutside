import { z } from "zod";
import { AiUsageSchema } from "./platform.js";

/** 讲解对象的三类（哲野 user spec「讲解的对象与方法」） */
export const ZheyeType = z.enum(["concept", "assertion", "entity"]);
export type ZheyeType = z.infer<typeof ZheyeType>;

// —— 配方（ZHEYE-0007、ZHEYE-0021）——

export const ZheyeStage = z.object({
  id: z.string(),
  name: z.string(),
  /** 这一步的提示词文件（相对配方目录） */
  prompt: z.string(),
  maxRounds: z.number().int().min(1),
});
export type ZheyeStage = z.infer<typeof ZheyeStage>;

export const ZheyeRecipeFile = z.object({
  /** 相对 recipes/ 的路径 */
  path: z.string(),
  content: z.string(),
});
export type ZheyeRecipeFile = z.infer<typeof ZheyeRecipeFile>;

export const ZheyeRecipe = z.object({
  type: ZheyeType,
  name: z.string(),
  model: z.string(),
  reasoningEffort: z.string(),
  /** 草稿文档的名字（例如 资料 / 大纲 / 前置 / 文章） */
  docs: z.array(z.string()),
  /** 哪一份草稿是最终的文章 */
  article: z.string(),
  /** 每一步共用的系统提示词文件 */
  system: z.array(z.string()),
  stages: z.array(ZheyeStage),
  /** 配方用到的全部文件（流程定义 + 提示词） */
  files: z.array(ZheyeRecipeFile),
  /** 全部文件内容的摘要，用来区分配方版本 */
  hash: z.string(),
});
export type ZheyeRecipe = z.infer<typeof ZheyeRecipe>;

export const ZheyeGetRecipeInput = z.object({ type: ZheyeType.optional() });
export type ZheyeGetRecipeInput = z.infer<typeof ZheyeGetRecipeInput>;

export const ZheyeGetRecipeOutput = z.object({
  /** 这一类还没有配方时为 null */
  recipe: ZheyeRecipe.nullable(),
  /** 读取或解析失败的原因 */
  error: z.string().nullable(),
  /** 各类是否已有配方 */
  available: z.array(ZheyeType),
});
export type ZheyeGetRecipeOutput = z.infer<typeof ZheyeGetRecipeOutput>;

// —— 试验台的试跑（ZHEYE-0020、ZHEYE-0021）——

export const ZheyeTrialStatus = z.enum(["running", "done", "stopped", "error", "interrupted"]);
export type ZheyeTrialStatus = z.infer<typeof ZheyeTrialStatus>;

export const ZheyeTrialSummary = z.object({
  id: z.string(),
  subject: z.string(),
  type: ZheyeType,
  flow: z.string(),
  recipeHash: z.string(),
  status: ZheyeTrialStatus,
  error: z.string().nullable(),
  costYuan: z.number(),
  webCalls: z.number().int(),
  usage: AiUsageSchema.nullable(),
  startedAt: z.number().int(),
  finishedAt: z.number().int().nullable(),
});
export type ZheyeTrialSummary = z.infer<typeof ZheyeTrialSummary>;

/**
 * 试跑轨迹里的一条记录（按 seq 递增）：
 * - stage_start：{ name, system, user }——这一步实际发给模型的系统提示词与用户消息；
 * - round：{ index, reasoning, content, toolCalls, usage, model, costYuan }——工具循环的一轮；
 * - doc：{ doc, op: "write" | "edit", content, old?, new? }——草稿的一次修改，content 是改完后的全文；
 * - stage_end：{ stopReason, error?, costYuan }。
 */
export const ZheyeTrialEvent = z.object({
  seq: z.number().int(),
  stage: z.string().nullable(),
  kind: z.enum(["stage_start", "round", "doc", "stage_end"]),
  data: z.record(z.unknown()),
  at: z.number().int(),
});
export type ZheyeTrialEvent = z.infer<typeof ZheyeTrialEvent>;

export const ZheyeTrialDetail = ZheyeTrialSummary.extend({
  /** 试跑时的配方快照 */
  recipe: ZheyeRecipe.nullable(),
  events: z.array(ZheyeTrialEvent),
  /** 进行中、且就在这次运行的 MyOutside 里 */
  active: z.boolean(),
});
export type ZheyeTrialDetail = z.infer<typeof ZheyeTrialDetail>;

export const ZheyeTrialStartInput = z.object({
  subject: z.string().trim().min(1).max(200),
  type: ZheyeType,
});
export type ZheyeTrialStartInput = z.infer<typeof ZheyeTrialStartInput>;

export const ZheyeTrialStartOutput = z.object({ runId: z.string(), status: ZheyeTrialStatus });
export type ZheyeTrialStartOutput = z.infer<typeof ZheyeTrialStartOutput>;

export const ZheyeTrialListInput = z.object({});
export type ZheyeTrialListInput = z.infer<typeof ZheyeTrialListInput>;

export const ZheyeTrialGetInput = z.object({
  runId: z.string().min(1),
  /** 只取 seq 大于它的轨迹记录（轮询进行中的试跑时用） */
  afterSeq: z.number().int().optional(),
});
export type ZheyeTrialGetInput = z.infer<typeof ZheyeTrialGetInput>;

export const ZheyeTrialStopInput = z.object({ runId: z.string().min(1) });
export type ZheyeTrialStopInput = z.infer<typeof ZheyeTrialStopInput>;

// 内部事务 API（试跑过程中由后端调用）

export const ZheyeTrialCreateInput = z.object({
  id: z.string().min(1),
  subject: z.string(),
  type: ZheyeType,
  flow: z.string(),
  recipeHash: z.string(),
  recipe: ZheyeRecipe,
});
export type ZheyeTrialCreateInput = z.infer<typeof ZheyeTrialCreateInput>;

export const ZheyeTrialAppendInput = z.object({
  runId: z.string().min(1),
  stage: z.string().nullable(),
  kind: ZheyeTrialEvent.shape.kind,
  data: z.record(z.unknown()),
});
export type ZheyeTrialAppendInput = z.infer<typeof ZheyeTrialAppendInput>;

export const ZheyeTrialFinishInput = z.object({
  runId: z.string().min(1),
  status: z.enum(["done", "stopped", "error"]),
  error: z.string().nullable(),
  docs: z.record(z.string()),
  usage: AiUsageSchema,
  costYuan: z.number(),
  webCalls: z.number().int(),
});
export type ZheyeTrialFinishInput = z.infer<typeof ZheyeTrialFinishInput>;

/** 哲野的 API 面（函数名 → 输入 / 输出） */
export interface ZheyeApi {
  "zheye.getRecipe": { input: ZheyeGetRecipeInput; output: ZheyeGetRecipeOutput };
  "zheye.trialStart": { input: ZheyeTrialStartInput; output: ZheyeTrialStartOutput };
  "zheye.trialList": { input: ZheyeTrialListInput; output: ZheyeTrialSummary[] };
  "zheye.trialGet": { input: ZheyeTrialGetInput; output: ZheyeTrialDetail };
  "zheye.trialStop": { input: ZheyeTrialStopInput; output: { ok: true; stopping: boolean } };
}
