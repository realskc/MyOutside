import { z } from "zod";

/** 平台内置 API 的输入约定：允许空对象或 undefined */
export const EmptyInput = z.union([z.undefined(), z.object({}).strict()]);

// —— 平台 AI 服务（DeepSeek 代理）——

/** 思考强度（DeepSeek `reasoning_effort`；none = 不思考） */
export const ReasoningEffort = z.enum(["none", "low", "high", "max"]);
export type ReasoningEffort = z.infer<typeof ReasoningEffort>;

/** 工具调用（OpenAI 形状；请求与响应共用） */
export const AiToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});
export type AiToolCall = z.infer<typeof AiToolCallSchema>;

/**
 * 聊天消息（OpenAI 形状）：
 * - system / user：必须带字符串 content；
 * - assistant：content 可为 null 或省略（配 tool_calls）；
 * - tool：工具结果，必须带 tool_call_id 与字符串 content。
 * 2026-10-07 扩展：支持 agent 工具循环所需的 assistant.tool_calls 与 tool 角色。
 */
export const AiMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string().nullable().optional(),
    /** 仅 assistant：本轮发起的工具调用 */
    tool_calls: z.array(AiToolCallSchema).optional(),
    /** 仅 tool：回应哪一次工具调用 */
    tool_call_id: z.string().optional(),
  })
  .superRefine((message, ctx) => {
    if ((message.role === "system" || message.role === "user") && typeof message.content !== "string") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `role=${message.role} 的消息必须带字符串 content` });
    }
    if (message.role === "tool" && typeof message.tool_call_id !== "string") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "role=tool 的消息必须带 tool_call_id" });
    }
    if (message.role === "tool" && typeof message.content !== "string") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "role=tool 的消息必须带字符串 content" });
    }
    if (message.role === "assistant" && message.content == null && !message.tool_calls?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "assistant 消息必须带 content 或 tool_calls" });
    }
  });
export type AiMessage = z.infer<typeof AiMessageSchema>;

export const AiChatInput = z.object({
  messages: z.array(AiMessageSchema).min(1),
  tools: z.array(z.record(z.unknown())).optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  /** 思考强度；不传 = 服务默认（high） */
  reasoningEffort: ReasoningEffort.optional(),
});
export type AiChatInput = z.infer<typeof AiChatInput>;

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
