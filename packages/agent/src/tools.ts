import type { WebFetchOutput, WebSearchResult } from "@myoutside/contracts";
import type { AgentContext, AgentTool } from "./types.js";

/**
 * 把一个 API 包装成工具：模型调用它时，经 ctx.call 调用这个 API（受内核权限检查）。
 * 参数格式由调用方给出（JSON Schema）；参数的校验由被调用的 API 负责。
 */
export function apiTool(
  api: string,
  spec: Omit<AgentTool, "execute"> & { mapArgs?: (args: Record<string, unknown>) => unknown },
): AgentTool {
  const { mapArgs, ...rest } = spec;
  return {
    ...rest,
    execute: (args: Record<string, unknown>, ctx: AgentContext) => ctx.call(api, mapArgs ? mapArgs(args) : args),
  };
}

/** 一次回复里引用的来源：编号在多次搜索 / 抓取之间保持一致，供正文用 [n] 标注（DIALOG-0010） */
export interface Source {
  index: number;
  url: string;
  title: string;
  siteName: string | null;
  snippet: string;
  date: string | null;
}

export interface SourceRegistry {
  /** 登记一个来源，返回它的编号（同一网址只编一次号） */
  add(source: Omit<Source, "index">): number;
  list(): Source[];
}

export function createSourceRegistry(initial: Source[] = []): SourceRegistry {
  const byUrl = new Map(initial.map((source) => [source.url, source]));
  return {
    add(source) {
      const existing = byUrl.get(source.url);
      if (existing) {
        if (!existing.title && source.title) existing.title = source.title;
        return existing.index;
      }
      const entry: Source = { ...source, index: byUrl.size + 1 };
      byUrl.set(source.url, entry);
      return entry.index;
    },
    list() {
      return [...byUrl.values()].sort((a, b) => a.index - b.index);
    },
  };
}

export interface WebToolOptions {
  /** 来源登记表；提供时，结果里的每个网页带编号，供模型用 [n] 引用 */
  sources?: SourceRegistry;
  /** 用户的原始问题（帮助搜索引擎理解意图） */
  question?: string;
  /** 每次搜索返回几条（默认 6） */
  count?: number;
}

/** 平台工具：网页搜索（调用平台 API platform.web.search） */
export function webSearchTool(options: WebToolOptions = {}): AgentTool {
  return {
    name: "web_search",
    description:
      "在网上搜索，返回若干网页的标题、链接、发布时间和摘要。需要最新信息、需要核实事实、或对答案没有把握时使用。可以使用 site:、lang:、after:、before: 等搜索语法。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索词（1～128 字）" },
      },
      required: ["query"],
    },
    untrusted: true,
    maxChars: 12000,
    summarize: (args) => `搜索：${String(args.query ?? "")}`,
    execute: (args, ctx) =>
      ctx.call("platform.web.search", {
        query: String(args.query ?? "").slice(0, 128),
        count: options.count ?? 6,
        ...(options.question ? { oriQuestion: options.question.slice(0, 128) } : {}),
      }),
    toModel: (output) => {
      const results = (output as { results: WebSearchResult[] }).results;
      if (results.length === 0) return "没有搜到结果。";
      return results
        .map((item, position) => {
          const index = options.sources
            ? options.sources.add({ url: item.url, title: item.title, siteName: item.siteName, snippet: item.snippet, date: item.date })
            : position + 1;
          const meta = [item.siteName, item.date?.slice(0, 10)].filter(Boolean).join(" · ");
          return `[${index}] ${item.title}\n${item.url}${meta ? `\n${meta}` : ""}\n${item.summary || item.snippet}`;
        })
        .join("\n\n");
    },
  };
}

/** 平台工具：读取一个网页的正文（调用平台 API platform.web.fetch） */
export function webFetchTool(options: WebToolOptions = {}): AgentTool {
  return {
    name: "web_fetch",
    description: "读取一个网页的正文（Markdown）。搜索结果的摘要不够详细、需要看原文时使用。",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "网页地址（http 或 https）" },
      },
      required: ["url"],
    },
    untrusted: true,
    maxChars: 12000,
    summarize: (args) => `阅读：${String(args.url ?? "")}`,
    execute: (args, ctx) => ctx.call("platform.web.fetch", { url: String(args.url ?? "") }),
    toModel: (output, args) => {
      const page = output as WebFetchOutput;
      const url = String(args.url ?? "");
      const index = options.sources?.add({ url, title: page.title, siteName: null, snippet: "", date: null });
      return `${index ? `[${index}] ` : ""}${page.title}\n${url}\n\n${page.content}`;
    },
  };
}
