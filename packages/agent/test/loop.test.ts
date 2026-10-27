import { describe, expect, it } from "vitest";
import { createSourceRegistry, runToolLoop, webSearchTool, type AgentContext, type AgentTool } from "../src/index.js";

interface FakeReply {
  content?: string;
  reasoning?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  /** 模拟流式中途被取消：平台 AI 返回已收到的部分 */
  aborted?: boolean;
}

/** 按脚本回复的假模型 + 可配置的其他 API；记录每次请求 */
function fakeContext(
  replies: Array<FakeReply | { error: { code: string; message: string; details?: unknown } }>,
  apis: Record<string, (payload: any) => unknown> = {},
  controller = new AbortController(),
) {
  const requests: any[] = [];
  const events: any[] = [];
  let index = 0;
  const ctx: AgentContext = {
    signal: controller.signal,
    emit: (event) => events.push(event),
    async call(name, payload: any) {
      if (name === "platform.ai.chat") {
        requests.push(structuredClone(payload));
        const reply = replies[index++];
        if (!reply) throw new Error("脚本里没有更多回复");
        if ("error" in reply) throw Object.assign(new Error(reply.error.message), reply.error);
        const toolCalls = (reply.toolCalls ?? []).map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        }));
        return {
          content: reply.content ?? "",
          reasoning: reply.reasoning ?? null,
          toolCalls,
          model: "deepseek-flash",
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          finishReason: reply.aborted ? "aborted" : toolCalls.length ? "tool_calls" : "stop",
          message: {
            role: "assistant",
            content: toolCalls.length && !reply.content ? null : reply.content ?? "",
            ...(reply.reasoning ? { reasoning_content: reply.reasoning } : {}),
            ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
          },
        };
      }
      const api = apis[name];
      if (!api) throw new Error(`未知 API：${name}`);
      return api(payload);
    },
  };
  return { ctx, requests, events, controller };
}

const echoTool: AgentTool = {
  name: "echo",
  description: "原样返回",
  parameters: { type: "object", properties: { text: { type: "string" } } },
  summarize: (args) => `回显：${String(args.text)}`,
  execute: async (args) => ({ echoed: args.text }),
};

const base = [{ role: "user" as const, content: "开始" }];

describe("runToolLoop", () => {
  it("没有工具调用：一轮结束", async () => {
    const { ctx, requests } = fakeContext([{ content: "你好", reasoning: "想" }]);
    const r = await runToolLoop(ctx, { messages: base, tools: [echoTool] });
    expect(r.stopReason).toBe("done");
    expect(r.content).toBe("你好");
    expect(r.rounds).toHaveLength(1);
    expect(r.messages).toEqual([{ role: "assistant", content: "你好", reasoning_content: "想" }]);
    expect(requests[0].tools[0].function.name).toBe("echo");
  });

  it("多轮：执行工具、把结果交回；历史带上上一轮的 reasoning_content 与工具消息；事件与用量", async () => {
    const { ctx, requests, events } = fakeContext([
      { content: "我先回显一下。", reasoning: "需要工具", toolCalls: [{ id: "c1", name: "echo", arguments: '{"text":"hi"}' }] },
      { content: "完成", reasoning: "好了" },
    ]);
    const r = await runToolLoop(ctx, { messages: base, tools: [echoTool] });
    expect(r.stopReason).toBe("done");
    expect(r.content).toBe("完成");
    expect(r.rounds[0]!.toolCalls[0]).toMatchObject({ id: "c1", ok: true, summary: "回显：hi", result: '{"echoed":"hi"}' });
    expect(requests[1].messages.slice(1)).toEqual([
      {
        role: "assistant",
        content: "我先回显一下。",
        reasoning_content: "需要工具",
        tool_calls: [{ id: "c1", type: "function", function: { name: "echo", arguments: '{"text":"hi"}' } }],
      },
      { role: "tool", tool_call_id: "c1", content: '{"echoed":"hi"}' },
    ]);
    expect(events.map((e) => e.type)).toEqual(["round_start", "tool_start", "tool_result", "round_end", "round_start", "round_end"]);
    expect(r.usage.totalTokens).toBe(30);
  });

  it("工具不存在、参数不是 JSON、执行失败：作为工具结果交给模型，循环继续", async () => {
    const failing: AgentTool = { ...echoTool, name: "boom", execute: async () => Promise.reject(new Error("坏了")) };
    const { ctx, requests } = fakeContext([
      {
        toolCalls: [
          { id: "a", name: "nope", arguments: "{}" },
          { id: "b", name: "echo", arguments: "{not json" },
          { id: "c", name: "boom", arguments: "{}" },
        ],
      },
      { content: "我换个办法" },
    ]);
    const r = await runToolLoop(ctx, { messages: base, tools: [echoTool, failing] });
    expect(r.stopReason).toBe("done");
    const toolMessages = requests[1].messages.filter((m: any) => m.role === "tool").map((m: any) => m.content);
    expect(toolMessages[0]).toContain("工具不存在");
    expect(toolMessages[1]).toContain("不是合法的 JSON");
    expect(toolMessages[2]).toContain("工具执行失败：坏了");
  });

  it("重复调用同一工具、同样参数：第二次不执行，提示直接使用之前的结果", async () => {
    let executed = 0;
    const counting: AgentTool = { ...echoTool, execute: async (args) => (executed++, { echoed: args.text }) };
    const { ctx } = fakeContext([
      { toolCalls: [{ id: "1", name: "echo", arguments: '{"text":"x"}' }] },
      { toolCalls: [{ id: "2", name: "echo", arguments: '{"text":"x"}' }] },
      { content: "好" },
    ]);
    const r = await runToolLoop(ctx, { messages: base, tools: [counting] });
    expect(executed).toBe(1);
    expect(r.rounds[1]!.toolCalls[0]!.result).toContain("重复调用");
  });

  it("达到最大轮数：最后一轮不再提供工具，让模型直接回答", async () => {
    const { ctx, requests } = fakeContext([
      { toolCalls: [{ id: "1", name: "echo", arguments: '{"text":"a"}' }] },
      { content: "根据已有信息回答" },
    ]);
    const r = await runToolLoop(ctx, { messages: base, tools: [echoTool], maxRounds: 2 });
    expect(r.stopReason).toBe("max_rounds");
    expect(r.content).toBe("根据已有信息回答");
    expect(requests[1].tools).toBeUndefined();
  });

  it("可重试的上游错误：退避后重试成功；不可重试的错误：结束为 error", async () => {
    const retry = fakeContext([
      { error: { code: "UPSTREAM", message: "429", details: { retryable: true } } },
      { content: "好了" },
    ]);
    const ok = await runToolLoop(retry.ctx, { messages: base, tools: [] });
    expect(ok.stopReason).toBe("done");
    expect(ok.content).toBe("好了");

    const fatal = fakeContext([{ error: { code: "UPSTREAM", message: "400 bad", details: { retryable: false } } }]);
    const bad = await runToolLoop(fatal.ctx, { messages: base, tools: [] });
    expect(bad.stopReason).toBe("error");
    expect(bad.error).toEqual({ code: "UPSTREAM", message: "400 bad" });
  }, 10000);

  it("取消：执行工具时被取消 → 本轮剩下的工具调用补上「已取消」，新增的消息仍然合法", async () => {
    const controller = new AbortController();
    const slow: AgentTool = {
      ...echoTool,
      name: "slow",
      execute: (_args, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal.addEventListener("abort", () => reject(Object.assign(new Error("取消"), { code: "ABORTED" })));
          setTimeout(() => controller.abort(), 5);
        }),
    };
    const { ctx } = fakeContext(
      [{ toolCalls: [{ id: "s", name: "slow", arguments: "{}" }, { id: "t", name: "echo", arguments: '{"text":"later"}' }] }],
      {},
      controller,
    );
    const r = await runToolLoop(ctx, { messages: base, tools: [slow, echoTool] });
    expect(r.stopReason).toBe("aborted");
    const assistant = r.messages[0] as any;
    const toolMessages = r.messages.slice(1) as any[];
    expect(assistant.tool_calls.map((c: any) => c.id)).toEqual(["s", "t"]);
    expect(toolMessages.map((m) => [m.tool_call_id, m.content])).toEqual([
      ["s", "已被用户取消"],
      ["t", "已被用户取消"],
    ]);
  });

  it("网页搜索工具：结果交给模型时带全局编号、包上不可信边界；来源登记表在多次搜索间编号一致", async () => {
    const sources = createSourceRegistry();
    const results = (urls: string[]) => ({
      results: urls.map((url) => ({ title: `标题 ${url}`, url, snippet: "短", summary: `关于 ${url} 的摘要`, content: "", siteName: "站", date: "2026-10-01T00:00:00Z", score: 2, authority: 3 })),
    });
    const { ctx, requests } = fakeContext(
      [
        { toolCalls: [{ id: "1", name: "web_search", arguments: '{"query":"甲"}' }] },
        { toolCalls: [{ id: "2", name: "web_search", arguments: '{"query":"乙"}' }] },
        { content: "答案 [1][3]" },
      ],
      {
        "platform.web.search": (payload) =>
          payload.query === "甲" ? results(["https://a.com", "https://b.com"]) : results(["https://b.com", "https://c.com"]),
      },
    );
    const r = await runToolLoop(ctx, { messages: base, tools: [webSearchTool({ sources, question: "原始问题" })] });
    expect(r.stopReason).toBe("done");
    const second = requests[2].messages.filter((m: any) => m.role === "tool")[1].content as string;
    expect(second).toContain("【以下是外部网页内容");
    expect(second).toContain("[2] 标题 https://b.com");
    expect(second).toContain("[3] 标题 https://c.com");
    expect(sources.list().map((s) => [s.index, s.url])).toEqual([
      [1, "https://a.com"],
      [2, "https://b.com"],
      [3, "https://c.com"],
    ]);
  });
  it("模型输出到一半被取消：已输出的部分作为最后一轮保留，以 aborted 结束", async () => {
    const { ctx } = fakeContext([
      { content: "我先查一下。", toolCalls: [{ id: "1", name: "echo", arguments: '{"text":"a"}' }] },
      { content: "查到的结果是", reasoning: "整理", aborted: true },
    ]);
    const r = await runToolLoop(ctx, { messages: base, tools: [echoTool] });
    expect(r.stopReason).toBe("aborted");
    expect(r.rounds).toHaveLength(2);
    expect(r.content).toBe("查到的结果是");
    expect(r.reasoning).toBe("整理");
  });
  it("输出到一半出错：重试前推送 round_retry；重试都失败时，最后收到的半截作为最后一轮保留", async () => {
    const broken = { code: "UPSTREAM", message: "读取流式响应失败", details: { retryable: true, partial: { content: "写到一半", reasoning: "想" } } };
    const { ctx, events } = fakeContext([
      { content: "我先查一下。", toolCalls: [{ id: "1", name: "echo", arguments: '{"text":"a"}' }] },
      { error: broken },
      { error: broken },
    ]);
    const r = await runToolLoop(ctx, { messages: base, tools: [echoTool], retries: 1 });
    expect(r.stopReason).toBe("error");
    expect(events.filter((e) => e.type === "round_retry")).toEqual([{ type: "round_retry", round: 2, attempt: 1 }]);
    expect(r.rounds).toHaveLength(2);
    expect(r.rounds[1]).toMatchObject({ content: "写到一半", reasoning: "想", toolCalls: [] });
  }, 10000);
});
