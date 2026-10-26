/**
 * 用真实的 DeepSeek 接口验证平台 AI / 搜索 / 抓取（在数据库副本上运行）。
 * 运行：pnpm ai:check <数据库副本路径>（务必用副本：会写入用量记录）
 */
import { createKernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";

const dbPath = process.argv[2];
if (!dbPath) throw new Error("需要数据库副本路径");
const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: dbPath }) });
kernel.start();

async function call(name: string, payload: unknown, emit?: (e: unknown) => void) {
  const res = await kernel.handle({ call: name, payload }, { emit });
  if (!res.ok) throw new Error(`${name}: ${res.error.code} ${res.error.message}`);
  return res.result as any;
}

// 1. 流式 + 思考
let deltas = 0;
const streamed = await call(
  "platform.ai.chat",
  { messages: [{ role: "user", content: "用一句话说明什么是间隔重复。" }], reasoningEffort: "low", stream: true },
  () => deltas++,
);
console.log("[stream] deltas:", deltas, "| content:", streamed.content, "| reasoning chars:", streamed.reasoning?.length ?? 0, "| finish:", streamed.finishReason, "| usage:", JSON.stringify(streamed.usage));

// 2. 思考模式下的工具调用 + 回传 reasoning_content（两轮）
const tools = [{ type: "function", function: { name: "get_date", description: "获取今天的日期", parameters: { type: "object", properties: {} } } }];
const messages: any[] = [{ role: "user", content: "今天是几号？请调用工具获取后回答。" }];
const r1 = await call("platform.ai.chat", { messages, tools, reasoningEffort: "low", stream: true });
console.log("[tools r1] finish:", r1.finishReason, "| toolCalls:", JSON.stringify(r1.toolCalls), "| has reasoning:", !!r1.reasoning);
messages.push(r1.message);
for (const tc of r1.toolCalls) messages.push({ role: "tool", tool_call_id: tc.id, content: "2026-10-26" });
const r2 = await call("platform.ai.chat", { messages, tools, reasoningEffort: "low" });
console.log("[tools r2] finish:", r2.finishReason, "| content:", r2.content);

// 3. 搜索
const search = await call("platform.web.search", { query: "DeepSeek 搜索 API 发布", count: 3, oriQuestion: "DeepSeek 最近发布了什么" });
console.log("[search] results:", search.results.length);
for (const item of search.results) console.log("   -", item.title, "|", item.url, "| score", item.score, "| summary chars", item.summary.length);

// 4. 抓取
const page = await call("platform.web.fetch", { url: "https://api-docs.deepseek.com/zh-cn/guides/search" });
console.log("[fetch] title:", page.title, "| content chars:", page.content.length);
