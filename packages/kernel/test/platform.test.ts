import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createKernel, type DbAdapter, type SqlValue } from "../src/index.js";

function createMemoryAdapter(): DbAdapter {
  const db = new DatabaseSync(":memory:");
  const normalize = (params: SqlValue[]) =>
    params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p === undefined ? null : p));
  return {
    execute(sql, params = []) {
      const r = db.prepare(sql).run(...normalize(params));
      return { changes: Number(r.changes), lastInsertRowid: (r.lastInsertRowid ?? 0) as number | bigint };
    },
    select(sql, params = []) {
      return db.prepare(sql).all(...normalize(params)) as never[];
    },
    transaction(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
}

async function setup() {
  const storage = createMemoryAdapter();
  const kernel = createKernel({ storage });
  kernel.start();
  await kernel.handle({ call: "platform.settings.set", payload: { key: "ai.deepseek.apiKey", value: "sk-test" } });
  return { storage, kernel };
}

/** 构造一个 SSE 响应体 */
function sseResponse(chunks: unknown[]): Response {
  const text = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** 等计量写入（经写队列）落库 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("platform AI / web", () => {
  it("回传思考过程：assistant 的 reasoning_content 原样转发；返回可直接追加的 message", async () => {
    const { kernel } = await setup();
    let body: { messages: Array<Record<string, unknown>> } = { messages: [] };
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return jsonResponse({
        model: "deepseek-flash",
        choices: [{ message: { content: "答案", reasoning_content: "想了一下" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28, prompt_cache_hit_tokens: 16 },
      });
    });
    const r = await kernel.handle({
      call: "platform.ai.chat",
      payload: {
        messages: [
          { role: "user", content: "问题一" },
          { role: "assistant", content: "回答一", reasoning_content: "之前的思考" },
          { role: "user", content: "问题二" },
        ],
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(body.messages[1]).toMatchObject({ role: "assistant", reasoning_content: "之前的思考" });
    const out = r.result as { message: Record<string, unknown>; finishReason: string; usage: { cacheHitTokens: number } };
    expect(out.message).toEqual({ role: "assistant", content: "答案", reasoning_content: "想了一下" });
    expect(out.finishReason).toBe("stop");
    expect(out.usage.cacheHitTokens).toBe(16);
  });

  it("流式：思考与正文的增量经 emit 推送；工具调用参数分片拼装；usage 取最后一块", async () => {
    const { kernel } = await setup();
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return sseResponse([
        { model: "deepseek-flash", choices: [{ delta: { reasoning_content: "先" } }] },
        { choices: [{ delta: { reasoning_content: "搜索" } }] },
        { choices: [{ delta: { content: "我先搜一下。" } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "web_search", arguments: '{"que' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"DeepSeek"}' } }] } }] },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 } },
      ]);
    });
    const events: unknown[] = [];
    const r = await kernel.handle(
      { call: "platform.ai.chat", payload: { messages: [{ role: "user", content: "最近的新闻" }], stream: true } },
      { emit: (event) => events.push(event) },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(events).toEqual([
      { type: "ai_delta", reasoning: "先" },
      { type: "ai_delta", reasoning: "搜索" },
      { type: "ai_delta", content: "我先搜一下。" },
    ]);
    const out = r.result as {
      content: string;
      reasoning: string;
      toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>;
      finishReason: string;
      usage: { totalTokens: number };
      message: Record<string, unknown>;
    };
    expect(out.content).toBe("我先搜一下。");
    expect(out.reasoning).toBe("先搜索");
    expect(out.toolCalls).toEqual([{ id: "call_1", type: "function", function: { name: "web_search", arguments: '{"query":"DeepSeek"}' } }]);
    expect(out.finishReason).toBe("tool_calls");
    expect(out.usage.totalTokens).toBe(60);
    expect(out.message).toMatchObject({ role: "assistant", reasoning_content: "先搜索", tool_calls: out.toolCalls });
  });

  it("上游错误结构化：429 可重试、400 不可重试、401 → PRECONDITION", async () => {
    const { kernel } = await setup();
    const payload = { messages: [{ role: "user", content: "hi" }] };
    for (const [status, code, retryable] of [
      [429, "UPSTREAM", true],
      [400, "UPSTREAM", false],
      [401, "PRECONDITION", undefined],
    ] as const) {
      vi.stubGlobal("fetch", async () => new Response("err", { status }));
      const r = await kernel.handle({ call: "platform.ai.chat", payload });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe(code);
      if (retryable !== undefined) expect((r.error.details as { retryable: boolean }).retryable).toBe(retryable);
    }
  });

  it("取消：中止进行中的请求 → ABORTED", async () => {
    const { kernel } = await setup();
    vi.stubGlobal("fetch", (_url: string, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const controller = new AbortController();
    const pending = kernel.handle(
      { call: "platform.ai.chat", payload: { messages: [{ role: "user", content: "hi" }] } },
      { signal: controller.signal },
    );
    controller.abort();
    const r = await pending;
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("ABORTED");
  });

  it("按调用者计量：AI 调用记 token，搜索 / 抓取记次数（搜索无结果不计）", async () => {
    const storage = createMemoryAdapter();
    const kernel = createKernel({ storage });
    kernel.start();
    await kernel.handle({ call: "platform.settings.set", payload: { key: "ai.deepseek.apiKey", value: "sk-test" } });

    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/chat/completions")) {
        return jsonResponse({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        });
      }
      if (url.endsWith("/v1/tools/search")) return jsonResponse({ results: [{ title: "t", url: "https://a.com", summary: "s" }] });
      return jsonResponse({ title: "page", content: "# hi" });
    });
    await kernel.handle({ call: "platform.ai.chat", payload: { messages: [{ role: "user", content: "hi" }] } });
    await kernel.handle({ call: "platform.web.search", payload: { query: "DeepSeek" } });
    await kernel.handle({ call: "platform.web.fetch", payload: { url: "https://a.com" } });
    await flush();
    const rows = storage.select<{ caller: string; kind: string; prompt_tokens: number | null }>(
      "SELECT caller, kind, prompt_tokens FROM platform_usage ORDER BY id",
    );
    expect(rows).toEqual([
      { caller: "platform", kind: "ai.chat", prompt_tokens: 5 },
      { caller: "platform", kind: "web.search", prompt_tokens: null },
      { caller: "platform", kind: "web.fetch", prompt_tokens: null },
    ]);
  });

  it("网页搜索：请求体字段映射、结果字段整理", async () => {
    const { kernel } = await setup();
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return jsonResponse({
        results: [
          {
            rerank_score: 2.4,
            title: "DeepSeek V4 发布",
            url: "https://example.com/v4",
            snippet: "短摘要",
            summary: "长摘要",
            content: "",
            site_name: "Example",
            date: "2026-06-01T00:00:00+00:00",
            authority: 3,
          },
        ],
      });
    });
    const r = await kernel.handle({
      call: "platform.web.search",
      payload: { query: "DeepSeek 发布", count: 5, oriQuestion: "DeepSeek 最近发布了什么" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(body).toEqual({ query: "DeepSeek 发布", count: 5, need_content: false, ori_question: "DeepSeek 最近发布了什么" });
    expect((r.result as { results: unknown[] }).results[0]).toEqual({
      title: "DeepSeek V4 发布",
      url: "https://example.com/v4",
      snippet: "短摘要",
      summary: "长摘要",
      content: "",
      siteName: "Example",
      date: "2026-06-01T00:00:00+00:00",
      score: 2.4,
      authority: 3,
    });
  });

  it("网页抓取：非 http(s) 地址被参数校验拒绝；抓取失败（404）不可重试", async () => {
    const { kernel } = await setup();
    const bad = await kernel.handle({ call: "platform.web.fetch", payload: { url: "file:///etc/passwd" } });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe("VALIDATION");

    vi.stubGlobal("fetch", async () => new Response("not found", { status: 404 }));
    const missing = await kernel.handle({ call: "platform.web.fetch", payload: { url: "https://example.com/x" } });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.code).toBe("UPSTREAM");
    expect((missing.error.details as { retryable: boolean }).retryable).toBe(false);
  });
  it("流式中途取消：返回已经收到的部分，finishReason = aborted；未拼完的工具调用丢弃", async () => {
    const { kernel } = await setup();
    const controller = new AbortController();
    vi.stubGlobal("fetch", async (_url: string, init: { signal: AbortSignal }) => {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          const send = (chunk: unknown) => stream.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          send({ model: "deepseek-flash", choices: [{ delta: { reasoning_content: "想一想" } }] });
          send({ choices: [{ delta: { content: "第一段，" } }] });
          send({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "web_search", arguments: '{"q' } }] } }] });
          init.signal.addEventListener("abort", () => stream.error(new DOMException("aborted", "AbortError")));
          setTimeout(() => controller.abort(), 10);
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    const r = await kernel.handle(
      { call: "platform.ai.chat", payload: { messages: [{ role: "user", content: "hi" }], stream: true } },
      { signal: controller.signal },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = r.result as { content: string; reasoning: string; toolCalls: unknown[]; finishReason: string; usage: unknown };
    expect(out.finishReason).toBe("aborted");
    expect(out.content).toBe("第一段，");
    expect(out.reasoning).toBe("想一想");
    expect(out.toolCalls).toEqual([]);
    expect(out.usage).toBeNull();
  });
});
