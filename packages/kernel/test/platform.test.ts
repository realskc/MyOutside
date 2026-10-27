import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createKernel, estimateCost, isPeak, type DbAdapter, type SecretCodec, type SqlValue } from "../src/index.js";

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
  it("流式中途断网：照常报可重试的 UPSTREAM，已收到的部分放在 details.partial", async () => {
    const { kernel } = await setup();
    vi.stubGlobal("fetch", async () => {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "想" } }] })}\n\n`));
          stream.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "写到一半" } }] })}\n\n`));
          setTimeout(() => stream.error(new TypeError("terminated")), 5);
        },
      });
      return new Response(body, { status: 200 });
    });
    const r = await kernel.handle({
      call: "platform.ai.chat",
      payload: { messages: [{ role: "user", content: "hi" }], stream: true },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("UPSTREAM");
    expect(r.error.details).toMatchObject({ retryable: true, partial: { content: "写到一半", reasoning: "想" } });
  });
  it("计费：高峰 / 空闲时段按北京时间划分（D-0074）", () => {
    const beijing = (iso: string) => Date.parse(`${iso}+08:00`);
    expect(isPeak(beijing("2026-10-26T09:00:00"))).toBe(true); // 周一 9:00
    expect(isPeak(beijing("2026-10-26T08:59:00"))).toBe(false);
    expect(isPeak(beijing("2026-10-26T12:00:00"))).toBe(false); // 午休
    expect(isPeak(beijing("2026-10-26T17:59:00"))).toBe(true);
    expect(isPeak(beijing("2026-10-26T18:00:00"))).toBe(false);
    expect(isPeak(beijing("2026-10-31T10:00:00"))).toBe(false); // 周六
  });

  it("计费：缓存命中 / 未命中 / 输出分别计价，空闲时段半价；搜索与抓取按次", () => {
    const peak = Date.parse("2026-10-26T10:00:00+08:00");
    const idle = Date.parse("2026-10-26T20:00:00+08:00");
    const usage = { kind: "ai.chat", model: "deepseek-flash", promptTokens: 1_000_000, cacheHitTokens: 400_000, completionTokens: 100_000 };
    // 高峰：40 万 × 0.04 + 60 万 × 2 + 10 万 × 8（元 / 百万）= 0.016 + 1.2 + 0.8
    expect(estimateCost({ ...usage, createdAt: peak })).toBeCloseTo(2.016, 6);
    expect(estimateCost({ ...usage, createdAt: idle })).toBeCloseTo(1.008, 6);
    expect(estimateCost({ ...usage, model: "deepseek-v4-pro", createdAt: peak })).toBeCloseTo(0.12 + 5.4 + 2.7, 6);
    expect(estimateCost({ kind: "web.search", createdAt: peak })).toBe(0.005);
    expect(estimateCost({ kind: "ai.chat", model: "deepseek-flash", createdAt: peak })).toBe(0);
  });

  it("用量汇总：按调用者分组、带估算花费；只给外壳；可按时间筛选", async () => {
    const storage = createMemoryAdapter();
    const kernel = createKernel({ storage });
    kernel.start();
    await kernel.handle({ call: "platform.settings.set", payload: { key: "ai.deepseek.apiKey", value: "sk-test" } });
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/v1/tools/search")) return jsonResponse({ results: [{ title: "t", url: "https://a.com" }] });
      return jsonResponse({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, prompt_cache_hit_tokens: 800 },
      });
    });
    await kernel.handle({ call: "platform.ai.chat", payload: { messages: [{ role: "user", content: "hi" }] } });
    await kernel.handle({ call: "platform.ai.chat", payload: { messages: [{ role: "user", content: "hi" }] } });
    await kernel.handle({ call: "platform.web.search", payload: { query: "x" } });
    await flush();

    const denied = await kernel.handle({ call: "platform.usage.summary", payload: {} }, { caller: "dialog" });
    expect(denied.ok).toBe(false);
    const r = await kernel.handle({ call: "platform.usage.summary", payload: {} }, { caller: "shell" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = r.result as Array<Record<string, number | string>>;
    expect(row).toMatchObject({ caller: "platform", aiCalls: 2, promptTokens: 2000, cacheHitTokens: 1600, completionTokens: 200, searches: 1, fetches: 0 });
    expect(row!.costYuan as number).toBeGreaterThan(0.005);

    const later = await kernel.handle({ call: "platform.usage.summary", payload: { since: Date.now() + 60_000 } }, { caller: "shell" });
    expect(later.ok && later.result).toEqual([]);
  });

  it("早期没有花费列的用量表：启动时补列，并按当时的时段补算花费", () => {
    const storage = createMemoryAdapter();
    storage.execute(
      `CREATE TABLE platform_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, caller TEXT NOT NULL, kind TEXT NOT NULL, model TEXT,
         prompt_tokens INTEGER, completion_tokens INTEGER, reasoning_tokens INTEGER, cache_hit_tokens INTEGER, created_at INTEGER NOT NULL)`,
    );
    const idle = Date.parse("2026-10-25T20:00:00+08:00"); // 周日
    storage.execute(
      "INSERT INTO platform_usage (caller, kind, model, prompt_tokens, completion_tokens, cache_hit_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["dialog", "ai.chat", "deepseek-flash", 1_000_000, 0, 0, idle],
    );
    createKernel({ storage }).start();
    const [row] = storage.select<{ cost_yuan: number }>("SELECT cost_yuan FROM platform_usage");
    expect(row!.cost_yuan).toBeCloseTo(1, 6); // 100 万未命中输入 × 2 元 × 空闲半价
  });
  it("凭据加密保存：数据库里只有密文；平台内部解密后使用；已有的明文在启动时改为密文（D-0075）", async () => {
    const codec: SecretCodec = {
      encrypt: (plain) => Buffer.from(`sealed:${plain}`).toString("base64"),
      decrypt: (cipher) => {
        const text = Buffer.from(cipher, "base64").toString();
        if (!text.startsWith("sealed:")) throw new Error("bad cipher");
        return text.slice("sealed:".length);
      },
    };
    const storage = createMemoryAdapter();
    // 早期明文保存的密钥
    createKernel({ storage }).start();
    storage.execute("INSERT INTO platform_setting (key, value, updated_at) VALUES (?, ?, ?)", ["ai.deepseek.apiKey", JSON.stringify("sk-old"), 0]);

    const kernel = createKernel({ storage, secrets: codec });
    kernel.start();
    const raw = () => storage.select<{ value: string }>("SELECT value FROM platform_setting WHERE key = 'ai.deepseek.apiKey'")[0]!.value;
    expect(raw()).not.toContain("sk-old");
    expect(JSON.parse(raw())).toHaveProperty("$encrypted");

    let auth = "";
    vi.stubGlobal("fetch", async (_url: string, init: { headers: Record<string, string> }) => {
      auth = init.headers.authorization!;
      return jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
    });
    await kernel.handle({ call: "platform.ai.chat", payload: { messages: [{ role: "user", content: "hi" }] } });
    expect(auth).toBe("Bearer sk-old");

    await kernel.handle({ call: "platform.settings.set", payload: { key: "ai.deepseek.apiKey", value: "sk-new" } }, { caller: "shell" });
    expect(raw()).not.toContain("sk-new");
    const got = await kernel.handle({ call: "platform.settings.get", payload: { key: "ai.deepseek.apiKey" } }, { caller: "shell" });
    expect(got.ok && got.result).toEqual({ value: null, isSet: true });
    await kernel.handle({ call: "platform.ai.chat", payload: { messages: [{ role: "user", content: "hi" }] } });
    expect(auth).toBe("Bearer sk-new");
  });

  it("凭据无法解密（没有加解密能力 / 钥匙串拒绝）：PRECONDITION，提示重新填写", async () => {
    const storage = createMemoryAdapter();
    createKernel({ storage }).start();
    storage.execute("INSERT INTO platform_setting (key, value, updated_at) VALUES (?, ?, ?)", [
      "ai.deepseek.apiKey",
      JSON.stringify({ $encrypted: "xxxx" }),
      0,
    ]);
    const payload = { messages: [{ role: "user", content: "hi" }] };
    const noCodec = createKernel({ storage });
    noCodec.start();
    const a = await noCodec.handle({ call: "platform.ai.chat", payload });
    expect(!a.ok && a.error.code).toBe("PRECONDITION");

    const broken = createKernel({ storage, secrets: { encrypt: (p) => p, decrypt: () => { throw new Error("denied"); } } });
    broken.start();
    const b = await broken.handle({ call: "platform.ai.chat", payload });
    expect(!b.ok && b.error.code).toBe("PRECONDITION");
    if (!b.ok) expect(b.error.message).toContain("重新填写");
  });
});
