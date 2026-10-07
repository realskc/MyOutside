import { z } from "zod";
import { KernelError } from "./errors.js";
import type { ApiDefinition, DbAdapter } from "./types.js";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";

const AiToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

/**
 * 聊天消息（OpenAI 形状）：
 * - system / user：必须带字符串 content；
 * - assistant：content 可为 null 或省略（配 tool_calls）——2026-10-07 支持工具循环；
 * - tool：工具结果，必须带 tool_call_id 与字符串 content。
 */
export const AiMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string().nullable().optional(),
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
  /** 思考强度（none / low / high / max；不传 = 服务默认） */
  reasoningEffort: z.enum(["none", "low", "high", "max"]).optional(),
});

export type AiChatInput = z.infer<typeof AiChatInputSchema>;

interface DeepSeekChoice {
  message?: {
    content?: string | null;
    reasoning_content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  };
}

interface DeepSeekUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
}

function readSetting(storage: DbAdapter, key: string): unknown {
  const row = storage.select<{ value: string }>("SELECT value FROM platform_setting WHERE key = ?", [key])[0];
  return row ? (JSON.parse(row.value) as unknown) : null;
}

function readStringSetting(storage: DbAdapter, key: string): string | null {
  const value = readSetting(storage, key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * 平台 AI 服务（DeepSeek 代理）：
 * - API key 由平台保管，子应用拿不到；
 * - 请求透传 messages / tools / 思考强度（reasoning_effort）；
 * - 响应返回 content、tool calls、思考过程（reasoning_content）与 usage。
 */
export function createPlatformAiDefinition(storage: DbAdapter): ApiDefinition {
  return {
    kind: "read",
    input: AiChatInputSchema,
    handler: async (_ctx, input: AiChatInput) => {
      const apiKey = readStringSetting(storage, "ai.deepseek.apiKey");
      if (!apiKey) {
        throw new KernelError("PRECONDITION", "尚未配置 DeepSeek API Key（设置 → DeepSeek API Key）");
      }
      const baseUrl = readStringSetting(storage, "ai.deepseek.baseUrl") ?? DEFAULT_BASE_URL;
      const model = input.model ?? readStringSetting(storage, "ai.deepseek.model") ?? DEFAULT_MODEL;

      // assistant 带 tool_calls 而省略 content 时，显式补 null（OpenAI 形状）
      const messages = input.messages.map((message) =>
        message.role === "assistant" && message.content === undefined ? { ...message, content: null } : message,
      );

      let response: Response;
      try {
        response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            ...(input.tools ? { tools: input.tools } : {}),
            ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
            ...(input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}),
          }),
        });
      } catch (cause) {
        throw new KernelError(
          "UPSTREAM",
          `AI 请求失败（网络）：${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new KernelError("UPSTREAM", `AI 请求失败（HTTP ${response.status}）：${text.slice(0, 300)}`);
      }

      const data = (await response.json()) as {
        model?: string;
        choices?: DeepSeekChoice[];
        usage?: DeepSeekUsage;
      };
      const message = data.choices?.[0]?.message;
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
            ...(typeof data.usage.completion_tokens_details?.reasoning_tokens === "number"
              ? { reasoningTokens: data.usage.completion_tokens_details.reasoning_tokens }
              : {}),
          }
        : null;
      return {
        content: message?.content ?? "",
        reasoning: message?.reasoning_content ?? null,
        toolCalls: (message?.tool_calls ?? []).map((call) => ({
          id: call.id,
          type: "function" as const,
          function: call.function,
        })),
        model: data.model ?? model,
        usage,
      };
    },
  };
}
