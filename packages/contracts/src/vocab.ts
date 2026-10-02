import { z } from "zod";

/** 卡片状态：学习 / 已掌握（全手动） */
export const CardStatus = z.enum(["learning", "mastered"]);
export type CardStatus = z.infer<typeof CardStatus>;

/** 复习评分（ts-fsrs 的 Rating） */
export const Rating = z.enum(["again", "hard", "good", "easy"]);
export type Rating = z.infer<typeof Rating>;

/** 卡片（含 ts-fsrs 调度字段） */
export const CardSchema = z.object({
  id: z.string(),
  term: z.string(),
  display: z.string(),
  sense: z.string(),
  phonetic: z.string().nullable(),
  meaning: z.string(),
  context: z.string().nullable(),
  source: z.string().nullable(),
  status: CardStatus,
  due: z.number().int(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number().int(),
  scheduled_days: z.number().int(),
  learning_steps: z.number().int(),
  reps: z.number().int(),
  lapses: z.number().int(),
  state: z.number().int(),
  last_review: z.number().int().nullable(),
  created_at: z.number().int(),
});
export type Card = z.infer<typeof CardSchema>;

// —— API 输入 / 输出 ——

export const AddCardInput = z.object({
  term: z.string().min(1),
  display: z.string().min(1).optional(),
  sense: z.string().min(1),
  meaning: z.string().optional(),
  phonetic: z.string().optional(),
  context: z.string().optional(),
  source: z.string().optional(),
});
export type AddCardInput = z.infer<typeof AddCardInput>;

export const AddCardOutput = z.object({ cardId: z.string() });
export type AddCardOutput = z.infer<typeof AddCardOutput>;

export const UpdateCardInput = z.object({
  cardId: z.string(),
  patch: z.object({
    sense: z.string().min(1).optional(),
    meaning: z.string().optional(),
    phonetic: z.string().optional(),
    context: z.string().optional(),
  }),
});
export type UpdateCardInput = z.infer<typeof UpdateCardInput>;

export const OkOutput = z.object({ ok: z.literal(true) });
export type OkOutput = z.infer<typeof OkOutput>;

export const GetDueInput = z.object({
  before: z.number().int().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type GetDueInput = z.infer<typeof GetDueInput>;

export const ListCardsInput = z.object({
  term: z.string().optional(),
  query: z.string().optional(),
  status: CardStatus.optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});
export type ListCardsInput = z.infer<typeof ListCardsInput>;

export const SubmitReviewInput = z.object({
  cardId: z.string(),
  rating: Rating,
});
export type SubmitReviewInput = z.infer<typeof SubmitReviewInput>;

export const SubmitReviewOutput = z.object({
  state: z.number().int(),
  due: z.number().int(),
  scheduledDays: z.number().int(),
});
export type SubmitReviewOutput = z.infer<typeof SubmitReviewOutput>;

export const SetMasteredInput = z.object({
  cardId: z.string(),
  mastered: z.boolean(),
});
export type SetMasteredInput = z.infer<typeof SetMasteredInput>;

export const StatsSchema = z.object({
  cards: z.number().int(),
  learning: z.number().int(),
  mastered: z.number().int(),
  dueNow: z.number().int(),
});
export type Stats = z.infer<typeof StatsSchema>;

// —— 添加（两步流程的第一步：解析去重）——

export const ResolveCardInput = z.object({
  term: z.string().min(1),
  sense: z.string().min(1),
  meaning: z.string().optional(),
  context: z.string().optional(),
});
export type ResolveCardInput = z.infer<typeof ResolveCardInput>;

export const ResolveCardOutput = z.union([
  z.object({ action: z.literal("new") }),
  z.object({ action: z.literal("match"), cardId: z.string() }),
]);
export type ResolveCardOutput = z.infer<typeof ResolveCardOutput>;

/** vocab 应用的 API 面（函数名 → 输入 / 输出）。SDK 与后端都从这里取类型。 */
export interface VocabApi {
  "vocab.addCard": { input: AddCardInput; output: AddCardOutput };
  "vocab.resolveCard": { input: ResolveCardInput; output: ResolveCardOutput };
  "vocab.updateCard": { input: UpdateCardInput; output: OkOutput };
  "vocab.getDue": { input: GetDueInput; output: Card[] };
  "vocab.listCards": { input: ListCardsInput; output: Card[] };
  "vocab.submitReview": { input: SubmitReviewInput; output: SubmitReviewOutput };
  "vocab.setMastered": { input: SetMasteredInput; output: OkOutput };
  "vocab.getStats": { input: Record<string, never>; output: Stats };
}
