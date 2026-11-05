import { readCredential } from "./credentials.js";
import { KernelError } from "./errors.js";
import type { DbAdapter, SecretCodec } from "./types.js";

const DEFAULT_BASE_URL = "https://api.deepseek.com";

function readSetting(storage: DbAdapter, key: string): unknown {
  const row = storage.select<{ value: string }>("SELECT value FROM platform_setting WHERE key = ?", [key])[0];
  return row ? (JSON.parse(row.value) as unknown) : null;
}

export function readStringSetting(storage: DbAdapter, key: string): string | null {
  const value = readSetting(storage, key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** 读取 DeepSeek 的密钥与地址；密钥只在平台内部使用，子应用拿不到 */
export function deepseekConfig(storage: DbAdapter, secrets?: SecretCodec): { apiKey: string; baseUrl: string } {
  const apiKey = readCredential(storage, "ai.deepseek.apiKey", secrets);
  if (!apiKey) throw new KernelError("PRECONDITION", "尚未配置 DeepSeek API Key（设置 → DeepSeek API Key）");
  const baseUrl = (readStringSetting(storage, "ai.deepseek.baseUrl") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

/** 上游 HTTP 状态是否值得重试（408 / 429 / 5xx） */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * 向 DeepSeek 发 POST 请求；把网络错误、HTTP 错误、取消统一成 KernelError：
 * - 取消 → ABORTED；
 * - 网络错误 → UPSTREAM（details.retryable = true）；
 * - HTTP 错误 → UPSTREAM（details.status、details.retryable）；401 → PRECONDITION（密钥无效）。
 */
export async function deepseekPost(
  storage: DbAdapter,
  secrets: SecretCodec | undefined,
  path: string,
  body: unknown,
  signal: AbortSignal,
  label: string,
): Promise<Response> {
  const { apiKey, baseUrl } = deepseekConfig(storage, secrets);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (signal.aborted) throw new KernelError("ABORTED", "调用已取消");
    throw new KernelError("UPSTREAM", `${label}失败（网络）：${cause instanceof Error ? cause.message : String(cause)}`, {
      retryable: true,
    });
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 401) throw new KernelError("PRECONDITION", "DeepSeek API Key 无效（设置 → DeepSeek API Key）");
    throw new KernelError("UPSTREAM", `${label}失败（HTTP ${response.status}）：${text.slice(0, 300)}`, {
      status: response.status,
      retryable: isRetryableStatus(response.status),
    });
  }
  return response;
}

/** 逐条读出 SSE 的 data 行（以 `data: [DONE]` 结束） */
export async function* readSse(response: Response, signal: AbortSignal): AsyncGenerator<unknown> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal.aborted) throw new KernelError("ABORTED", "调用已取消");
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      try {
        chunk = await reader.read();
      } catch (cause) {
        if (signal.aborted) throw new KernelError("ABORTED", "调用已取消");
        throw new KernelError("UPSTREAM", `读取流式响应失败：${cause instanceof Error ? cause.message : String(cause)}`, {
          retryable: true,
        });
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue; // 空行、注释（: keep-alive）
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          yield JSON.parse(data) as unknown;
        } catch {
          /* 忽略无法解析的行 */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
