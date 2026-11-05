import { z } from "zod";
import { deepseekPost } from "./deepseek.js";
import type { RecordUsage } from "./platform-ai.js";
import type { ApiDefinition, DbAdapter, ReadContext, SecretCodec } from "./types.js";

export const WebSearchInputSchema = z.object({
  /** 搜索词，1～128 字符；支持 site:、lang:、after:、before: 等搜索语法 */
  query: z.string().trim().min(1).max(128),
  count: z.number().int().min(1).max(50).optional(),
  /** 是否返回网页正文（content） */
  needContent: z.boolean().optional(),
  /** 触发搜索的用户原始问题，帮助理解搜索意图 */
  oriQuestion: z.string().trim().min(1).max(128).optional(),
});

export const WebFetchInputSchema = z.object({
  url: z
    .string()
    .max(8192)
    .refine((value) => /^https?:\/\/[^/\s]+/i.test(value), "必须是含 host 的 http(s) 地址"),
});

interface RawSearchResult {
  rerank_score?: number;
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  content?: string;
  site_name?: string | null;
  date?: string | null;
  authority?: number;
}

/**
 * 平台 API：网页搜索（DeepSeek 自研搜索引擎，D-0050）。
 * 密钥由平台保管；按调用者计量（按次计费：5 元 / 千次成功请求）。
 */
export function createWebSearchDefinition(storage: DbAdapter, recordUsage: RecordUsage, secrets?: SecretCodec): ApiDefinition {
  return {
    kind: "read",
    visibility: "public",
    input: WebSearchInputSchema,
    handler: async (ctx: ReadContext, input: z.infer<typeof WebSearchInputSchema>) => {
      const response = await deepseekPost(
        storage,
        secrets,
        "/v1/tools/search",
        {
          query: input.query,
          count: input.count ?? 8,
          need_content: input.needContent ?? false,
          ...(input.oriQuestion ? { ori_question: input.oriQuestion } : {}),
        },
        ctx.signal,
        "网页搜索",
      );
      const data = (await response.json()) as { results?: RawSearchResult[] };
      const results = (data.results ?? []).map((item) => ({
        title: item.title ?? "",
        url: item.url ?? "",
        snippet: item.snippet ?? "",
        summary: item.summary ?? "",
        content: item.content ?? "",
        siteName: item.site_name ?? null,
        date: item.date ?? null,
        score: item.rerank_score ?? null,
        authority: item.authority ?? null,
      }));
      if (results.length > 0) recordUsage({ caller: ctx.caller, kind: "web.search" });
      return { results };
    },
  };
}

/** 平台 API：抓取单个网页，返回 Markdown 正文（D-0050）。按调用者计量。 */
export function createWebFetchDefinition(storage: DbAdapter, recordUsage: RecordUsage, secrets?: SecretCodec): ApiDefinition {
  return {
    kind: "read",
    visibility: "public",
    input: WebFetchInputSchema,
    handler: async (ctx: ReadContext, input: z.infer<typeof WebFetchInputSchema>) => {
      const response = await deepseekPost(storage, secrets, "/v1/tools/fetch", { url: input.url }, ctx.signal, "网页抓取");
      const data = (await response.json()) as { title?: string; content?: string };
      recordUsage({ caller: ctx.caller, kind: "web.fetch" });
      return { title: data.title ?? "", content: data.content ?? "" };
    },
  };
}
