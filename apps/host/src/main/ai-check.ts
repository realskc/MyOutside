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

  await step("轮数用完：工具定义不变、tool_choice = none（思考模式），缓存照常命中（D-0078）", async () => {
    const tools = [
      { type: "function", function: { name: "get_date", description: "获取今天的日期", parameters: { type: "object", properties: {} } } },
    ];
    // 系统提示词放长一些（几千 token），缓存才看得出来
    const system = `你是一个助手。下面是一段不需要理会的背景资料：\n${"间隔重复是一种学习方法，复习的间隔随着记忆变牢而拉长。".repeat(120)}`;
    const messages: any[] = [
      { role: "system", content: system },
      { role: "user", content: "今天是几号？请调用工具获取后回答。" },
    ];
    const r1 = await call("platform.ai.chat", { messages, tools, reasoningEffort: "low" });
    if (r1.toolCalls.length === 0) throw new Error(`第一轮没有调用工具：${r1.content}`);
    messages.push(r1.message);
    for (const toolCall of r1.toolCalls) messages.push({ role: "tool", tool_call_id: toolCall.id, content: new Date().toISOString().slice(0, 10) });
    messages.push({ role: "user", content: "【已到最多轮数：这一次不能再调用工具了。请直接回复。】" });
    const r2 = await call("platform.ai.chat", { messages, tools, toolChoice: "none", reasoningEffort: "low" });
    if (r2.toolCalls.length > 0) throw new Error("tool_choice = none 时仍然调用了工具");
    if (/DSML/.test(r2.content)) throw new Error(`回复里出现了工具调用的格式：${r2.content.slice(0, 80)}`);
    const hit = r2.usage.cacheHitTokens ?? 0;
    if (hit < r1.usage.promptTokens / 2) throw new Error(`缓存几乎没有命中：输入 ${r2.usage.promptTokens}，命中 ${hit}`);
    return `第二轮输入 ${r2.usage.promptTokens}，命中缓存 ${hit}；回答「${r2.content.slice(0, 60)}」`;
  });

  await step("对话中途的 system 消息（思考模式 + 工具 + tool_choice = none，DIALOG-0019）", async () => {
    const tools = [
      { type: "function", function: { name: "web_search", description: "在网上搜索", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
    ];
    const r = await call("platform.ai.chat", {
      messages: [
        { role: "system", content: "你是一个助手。" },
        { role: "user", content: "DeepSeek 最近发布了什么？" },
        { role: "system", content: "【用户关闭了联网搜索功能，请不要调用 web_search、web_fetch，直接回答。】" },
      ],
      tools,
      toolChoice: "none",
      reasoningEffort: "low",
    });
    if (r.toolCalls.length > 0) throw new Error("仍然调用了工具");
    return `回答「${r.content.replace(/\s+/g, " ").slice(0, 60)}」`;
  });

  await step("原始请求原样透传（platform.ai.chatRaw，D-0082）", async () => {
    const r = await call("platform.ai.chatRaw", {
      body: {
        model: "deepseek-flash",
        messages: [{ role: "user", content: "只回答一个词：成功。" }],
        max_tokens: 16,
        temperature: 0,
        reasoning_effort: "none",
        stream: false,
      },
    });
    const content = r.body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") throw new Error("原始响应里没有正文");
    return `回答「${content.trim()}」，用量 ${JSON.stringify(r.usage)}，估算 ¥${r.costYuan}`;
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
