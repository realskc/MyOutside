/**
 * 用应用数据目录里的配置做一次真实 AI 调用（验证 key 与网络）。
 * 运行：pnpm.cmd ai:ping
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { createKernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { vocabApp } from "@myoutside/vocab";

const appData = process.env.APPDATA ?? join(homedir(), ".config");
const dbPath = join(appData, "MyOutside", "myoutside.db");
console.log("[ai-ping] db:", dbPath);

const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: dbPath }) });
kernel.registerApp(vocabApp);
kernel.start();

const res = await kernel.handle({
  call: "platform.ai.chat",
  payload: {
    messages: [
      { role: "system", content: "你是一个测试助手。" },
      { role: "user", content: "请用一句话回复：收到。" },
    ],
    temperature: 0,
  },
});
console.log(JSON.stringify(res, null, 2));
