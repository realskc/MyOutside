import type { Kernel } from "@myoutside/kernel";

/**
 * 用真实的 DeepSeek 接口验证平台 AI / 搜索 / 抓取（pnpm ai:check）。
 * 跑在 Electron 里（不显示窗口、在真实数据的临时副本上），密钥从系统钥匙串解密、只在内存里使用（D-0075）。
 * 花费：几分钱。
 */
export async function runAiCheck(kernel: Kernel): Promise<boolean> {
  let ok = true;
  const call = async (name: string, payload: unknown, emit?: (event: unknown) => void): Promise<any> => {
    const res = await kernel.handle({ call: name, payload }, { emit });
    if (!res.ok) throw new Error(`${name}: ${res.error.code} ${res.error.message}`);
    return res.result;
  };
  const step = async (label: string, run: () => Promise<string>) => {
    try {
      console.log(`[ai-check] ✓ ${label}：${await run()}`);
    } catch (error) {
      ok = false;
      console.error(`[ai-check] ✕ ${label}：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  await step("流式 + 思考", async () => {
    let deltas = 0;
    const r = await call(
      "platform.ai.chat",
      { messages: [{ role: "user", content: "用一句话说明什么是间隔重复。" }], reasoningEffort: "low", stream: true },
      () => (deltas += 1),
    );
    return `${deltas} 个增量，回答「${r.content}」，思考 ${r.reasoning?.length ?? 0} 字，结束原因 ${r.finishReason}，用量 ${JSON.stringify(r.usage)}`;
  });

  await step("思考模式下的工具调用 + 回传思考过程（两轮）", async () => {
    const tools = [
      { type: "function", function: { name: "get_date", description: "获取今天的日期", parameters: { type: "object", properties: {} } } },
    ];
    const messages: any[] = [{ role: "user", content: "今天是几号？请调用工具获取后回答。" }];
    const r1 = await call("platform.ai.chat", { messages, tools, reasoningEffort: "low", stream: true });
    if (r1.toolCalls.length === 0) throw new Error(`第一轮没有调用工具：${r1.content}`);
    messages.push(r1.message);
    for (const toolCall of r1.toolCalls) messages.push({ role: "tool", tool_call_id: toolCall.id, content: new Date().toISOString().slice(0, 10) });
    const r2 = await call("platform.ai.chat", { messages, tools, reasoningEffort: "low" });
    return `第一轮调用 ${r1.toolCalls.map((c: any) => c.function.name).join("、")}，第二轮回答「${r2.content}」`;
  });

  await step("网页搜索", async () => {
    const r = await call("platform.web.search", { query: "DeepSeek 搜索 API 发布", count: 3, oriQuestion: "DeepSeek 最近发布了什么" });
    if (r.results.length === 0) throw new Error("没有结果");
    return `${r.results.length} 条，第一条「${r.results[0].title}」`;
  });

  await step("网页抓取", async () => {
    const r = await call("platform.web.fetch", { url: "https://api-docs.deepseek.com/zh-cn/guides/search" });
    return `「${r.title}」，正文 ${r.content.length} 字`;
  });

  return ok;
}
