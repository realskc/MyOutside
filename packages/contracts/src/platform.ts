import { z } from "zod";

/** 平台内置 API 的输入约定：允许空对象或 undefined */
export const EmptyInput = z.union([z.undefined(), z.object({}).strict()]);

// —— 平台 AI 服务（DeepSeek 代理）——

export const AiChatInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() }))
    .min(1),
  tools: z.array(z.record(z.unknown())).optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
});
export type AiChatInput = z.infer<typeof AiChatInput>;

export const AiToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});
export type AiToolCall = z.infer<typeof AiToolCallSchema>;

export const AiChatOutput = z.object({
  content: z.string(),
  toolCalls: z.array(AiToolCallSchema),
  model: z.string(),
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
