import { z } from "zod";
import { deepseekPost, readSse, readStringSetting } from "./deepseek.js";
import { KernelError } from "./errors.js";
import type { ApiDefinition, DbAdapter, ReadContext } from "./types.js";

const DEFAULT_MODEL = "deepseek-flash";

const AiToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

/**
 * 聊天消息（OpenAI 形状）：
 * - system / user：必须带字符串 content；
 * - assistant：content 可为 null 或省略（配 tool_calls）；可带 reasoning_content（思考过程）——
 *   DeepSeek 规定：请求带 tools 时，历史中每一轮的 reasoning_content 都必须回传，否则 400；
 * - tool：工具结果，必须带 tool_call_id 与字符串 content。
 */
export const AiMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string().nullable().optional(),
    reasoning_content: z.string().nullable().optional(),
    tool_calls: z.array(AiToolCallSchema).optional(),
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

export const AiChatInputSchema = z.object({
  messages: z.array(AiMessageSchema).min(1),
  /** OpenAI 兼容的工具定义（透传） */
  tools: z.array(z.record(z.unknown())).optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  /** 思考强度（none 关闭思考；不传 = 服务默认 high） */
  reasoningEffort: z.enum(["none", "low", "high", "max"]).optional(),
  /** 流式：增量经推送通道发出（事件 ai_delta），最终仍返回完整结果 */
  stream: z.boolean().optional(),
});

export type AiChatInput = z.infer<typeof AiChatInputSchema>;

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface DeepSeekUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cacheHitTokens?: number;
}

function mapUsage(usage: DeepSeekUsage | undefined): AiUsage | null {
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    ...(typeof usage.completion_tokens_details?.reasoning_tokens === "number"
      ? { reasoningTokens: usage.completion_tokens_details.reasoning_tokens }
      : {}),
    ...(typeof usage.prompt_cache_hit_tokens === "number" ? { cacheHitTokens: usage.prompt_cache_hit_tokens } : {}),
  };
}

/** 平台用量记录（按调用者）：由内核经写队列写入 */
export interface UsageRecord {
  caller: string | undefined;
  kind: string;
  model?: string | null;
  usage?: AiUsage | null;
}

export type RecordUsage = (record: UsageRecord) => void;

/**
 * 平台 AI 服务（DeepSeek 代理）：
 * - API key 由平台保管，子应用拿不到；
 * - 请求透传 messages（含 reasoning_content 回传）/ tools / 思考强度；
 * - 响应返回内容、思考过程、工具调用、可直接追加进历史的 assistant 消息、结束原因与 usage；
 * - stream = true 时，增量经 ctx.emit 推送：{ type: "ai_delta", content?, reasoning? }；
 *   中途被取消时不报错，返回已经收到的部分，finishReason = "aborted"（未拼完的工具调用丢弃；拿不到 usage）；
 *   中途出错（例如断网）时照常报错，已经收到的部分放在错误的 details.partial = { content, reasoning } 里；
 * - 每次成功调用按调用者记一条用量。
 */
export function createPlatformAiDefinition(storage: DbAdapter, recordUsage: RecordUsage = () => {}): ApiDefinition {
  return {
    kind: "read",
    visibility: "public",
    input: AiChatInputSchema,
    handler: async (ctx: ReadContext, input: AiChatInput) => {
      const model = input.model ?? readStringSetting(storage, "ai.deepseek.model") ?? DEFAULT_MODEL;

      // assistant 带 tool_calls 而省略 content 时，显式补 null（OpenAI 形状）
      const messages = input.messages.map((message) =>
        message.role === "assistant" && message.content === undefined ? { ...message, content: null } : message,
      );
      const body = {
        model,
        messages,
        ...(input.tools ? { tools: input.tools } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}),
        ...(input.stream ? { stream: true, stream_options: { include_usage: true } } : {}),
      };
      const response = await deepseekPost(storage, "/chat/completions", body, ctx.signal, "AI 请求");

      let content = "";
      let reasoning = "";
      let toolCalls: ToolCall[] = [];
      let finishReason: string | null = null;
      let usage: AiUsage | null = null;
      let responseModel = model;

      if (input.stream) {
        const partial: Array<{ id: string; name: string; arguments: string }> = [];
        try {
          for await (const raw of readSse(response, ctx.signal)) {
            const chunk = raw as {
              model?: string;
              choices?: Array<{
                delta?: {
                  content?: string | null;
                  reasoning_content?: string | null;
                  tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
                };
                finish_reason?: string | null;
              }>;
              usage?: DeepSeekUsage;
            };
            if (chunk.model) responseModel = chunk.model;
            if (chunk.usage) usage = mapUsage(chunk.usage);
            const choice = chunk.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta ?? {};
            if (delta.reasoning_content) {
              reasoning += delta.reasoning_content;
              ctx.emit({ type: "ai_delta", reasoning: delta.reasoning_content });
            }
            if (delta.content) {
              content += delta.content;
              ctx.emit({ type: "ai_delta", content: delta.content });
            }
            // 流式下工具调用的参数分片到达：按 index 拼装
            for (const piece of delta.tool_calls ?? []) {
              const slot = (partial[piece.index] ??= { id: "", name: "", arguments: "" });
              if (piece.id) slot.id = piece.id;
              if (piece.function?.name) slot.name += piece.function.name;
              if (piece.function?.arguments) slot.arguments += piece.function.arguments;
            }
            if (choice.finish_reason) finishReason = choice.finish_reason;
          }
        } catch (cause) {
          // 流式中途被取消：返回已经收到的部分（finishReason = "aborted"），由调用方决定要不要保留
          if (cause instanceof KernelError && cause.code === "ABORTED") {
            finishReason = "aborted";
          } else if (cause instanceof KernelError && (content !== "" || reasoning !== "")) {
            // 流式中途出错（例如断网）：已经收到的部分附在错误里（details.partial），由调用方决定要不要保留
            throw new KernelError(cause.code, cause.message, {
              ...((cause.details as Record<string, unknown> | undefined) ?? {}),
              partial: { content, reasoning },
            });
          } else {
            throw cause;
          }
        }
        toolCalls =
          finishReason === "aborted"
            ? []
            : partial
                .filter((slot) => slot && slot.name)
                .map((slot) => ({
                  id: slot.id,
                  type: "function" as const,
                  function: { name: slot.name, arguments: slot.arguments },
                }));
      } else {
        const data = (await response.json()) as {
          model?: string;
          choices?: Array<{
            message?: {
              content?: string | null;
              reasoning_content?: string | null;
              tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
            };
            finish_reason?: string | null;
          }>;
          usage?: DeepSeekUsage;
        };
        const message = data.choices?.[0]?.message;
        content = message?.content ?? "";
        reasoning = message?.reasoning_content ?? "";
        toolCalls = (message?.tool_calls ?? []).map((call) => ({
          id: call.id,
          type: "function" as const,
          function: call.function,
        }));
        finishReason = data.choices?.[0]?.finish_reason ?? null;
        usage = mapUsage(data.usage);
        responseModel = data.model ?? model;
      }

      if (ctx.signal.aborted && finishReason !== "aborted") throw new KernelError("ABORTED", "调用已取消");
      recordUsage({ caller: ctx.caller, kind: "ai.chat", model: responseModel, usage });

      return {
        content,
        reasoning: reasoning === "" ? null : reasoning,
        toolCalls,
        model: responseModel,
        usage,
        finishReason,
        /** 可直接追加进历史的 assistant 消息（含 reasoning_content，满足 DeepSeek 的回传规则） */
        message: {
          role: "assistant" as const,
          content: content === "" && toolCalls.length > 0 ? null : content,
          ...(reasoning !== "" ? { reasoning_content: reasoning } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
      };
    },
  };
}
