import { z } from "zod";
import { KernelError } from "./errors.js";
import type { ApiDefinition, DbAdapter } from "./types.js";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

export const AiMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const AiChatInputSchema = z.object({
  messages: z.array(AiMessageSchema).min(1),
  /** OpenAI 兼容的工具定义（透传） */
  tools: z.array(z.record(z.unknown())).optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
});

export type AiChatInput = z.infer<typeof AiChatInputSchema>;

interface DeepSeekChoice {
  message?: {
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  };
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
 * - 请求透传 messages / tools，响应（含 tool calls）原样返回。
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
            messages: input.messages,
            ...(input.tools ? { tools: input.tools } : {}),
            ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
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

      const data = (await response.json()) as { model?: string; choices?: DeepSeekChoice[] };
      const message = data.choices?.[0]?.message;
      return {
        content: message?.content ?? "",
        toolCalls: (message?.tool_calls ?? []).map((call) => ({
          id: call.id,
          type: "function" as const,
          function: call.function,
        })),
        model: data.model ?? model,
      };
    },
  };
}
