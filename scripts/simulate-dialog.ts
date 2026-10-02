/**
 * 模拟「对话应用」：不经 UI、直接经内核调用 vocab 的 API。
 * 验证跨应用写入路径（同一个内核入口）与事务行为。
 *
 * 运行：pnpm.cmd simulate
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createKernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { vocabApp } from "@myoutside/vocab";

const dataDir = join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, "myoutside-dev.db");

const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: dbPath }) });
kernel.registerApp(vocabApp);
kernel.start();

const added = await kernel.handle({
  call: "vocab.addCard",
  payload: {
    term: "serendipity",
    sense: "意外发现美好事物的能力",
    meaning: "n. 机缘巧合；意外发现珍奇事物的本领",
    context: "来自对话：What a serendipity!",
    source: "dialog",
  },
});
console.log("[simulate-dialog] vocab.addCard →");
console.log(JSON.stringify(added, null, 2));

const due = await kernel.handle({ call: "vocab.getDue", payload: { limit: 5 } });
console.log("[simulate-dialog] vocab.getDue →");
console.log(JSON.stringify(due, null, 2));
