/**
 * 做一次真实 AI 调用（验证 key、模型与思考强度参数）。在内存数据库上运行，不碰真实数据。
 * 运行：DEEPSEEK_API_KEY=sk-... pnpm ai:ping
 * （MyOutside 里的密钥用系统钥匙串加密保存，脚本解不开，所以由环境变量提供，D-0075）
 */
import { createKernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error("需要环境变量 DEEPSEEK_API_KEY");
const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: ":memory:" }) });
kernel.start();
await kernel.handle({ call: "platform.settings.set", payload: { key: "ai.deepseek.apiKey", value: apiKey } });

const res = await kernel.handle({
  call: "platform.ai.chat",
  payload: {
    messages: [
      { role: "system", content: "你是一个测试助手。" },
      { role: "user", content: "请用一句话回复：收到。" },
    ],
    reasoningEffort: "low",
  },
});

if (res.ok) {
  const result = res.result as {
    content: string;
    reasoning: string | null;
    model: string;
    usage: unknown;
  };
  console.log("[ai-ping] model:", result.model);
  console.log("[ai-ping] content:", result.content);
  console.log("[ai-ping] reasoning chars:", result.reasoning ? result.reasoning.length : 0);
  console.log("[ai-ping] usage:", JSON.stringify(result.usage));
} else {
  console.log(JSON.stringify(res, null, 2));
}
