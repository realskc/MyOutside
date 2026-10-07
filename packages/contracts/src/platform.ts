import { z } from "zod";

/** 平台内置 API 的输入约定：允许空对象或 undefined */
export const EmptyInput = z.union([z.undefined(), z.object({}).strict()]);

// —— 平台 AI 服务（DeepSeek 代理）——

/** 思考强度（DeepSeek `reasoning_effort`；none = 不思考） */
export const ReasoningEffort = z.enum(["none", "low", "high", "max"]);
export type ReasoningEffort = z.infer<typeof ReasoningEffort>;

export const AiChatInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() }))
    .min(1),
  tools: z.array(z.record(z.unknown())).optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  /** 思考强度；不传 = 服务默认（high） */
  reasoningEffort: ReasoningEffort.optional(),
});
export type AiChatInput = z.infer<typeof AiChatInput>;

export const AiToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});
export type AiToolCall = z.infer<typeof AiToolCallSchema>;

/** token 用量（模型响应透传；思考模式下含 reasoning tokens） */
export const AiUsageSchema = z.object({
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  totalTokens: z.number().int(),
  reasoningTokens: z.number().int().optional(),
});
export type AiUsage = z.infer<typeof AiUsageSchema>;

export const AiChatOutput = z.object({
  content: z.string(),
  /** 思考过程（仅思考模式；否则为 null） */
  reasoning: z.string().nullable(),
  toolCalls: z.array(AiToolCallSchema),
  model: z.string(),
  usage: AiUsageSchema.nullable(),
});
export type AiChatOutput = z.infer<typeof AiChatOutput>;

/** 平台内置 API 面 */
export interface PlatformApi {
  "platform.dataVersion": { input: Record<string, never>; output: number };
  "platform.listApps": { input: Record<string, never>; output: Array<{ id: string; name: string }> };
  "platform.settings.get": { input: { key: string }; output: { value: unknown } };
  "platform.settings.set": { input: { key: string; value: unknown }; output: { ok: true } };
  "platform.ai.chat": { input: AiChatInput; output: AiChatOutput };
}
