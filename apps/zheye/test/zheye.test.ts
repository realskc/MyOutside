import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createKernel, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createZheyeApp, loadRecipe, renderPrompt } from "../backend/src/index.js";
import { createDrafts } from "../backend/src/drafts.js";
import zheyeManifest from "../manifest.json";

const RECIPES = resolve(__dirname, "../recipes");

function setup(recipesDir = RECIPES): Kernel {
  const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: ":memory:" }) });
  kernel.registerApp(createZheyeApp({ recipesDir }), zheyeManifest);
  kernel.start();
  return kernel;
}

async function call<T>(kernel: Kernel, name: string, payload?: unknown, options: Parameters<Kernel["handle"]>[1] = {}): Promise<T> {
  const res = await kernel.handle({ call: name, payload }, options);
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.result as T;
}

interface FakeReply {
  content?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

/** 按脚本回复的假 DeepSeek（SSE 流式） */
function fakeDeepSeek(replies: FakeReply[]) {
  const requests: any[] = [];
  let index = 0;
  let callId = 0;
  const fetch = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const path = new URL(url).pathname;
    if (path !== "/chat/completions") return new Response("not found", { status: 404 });
    requests.push(body);
    const reply = replies[index++];
    if (!reply) throw new Error("脚本里没有更多回复");
    const chunks: unknown[] = [{ model: "deepseek-flash", choices: [{ delta: { reasoning_content: "想一想。" } }] }];
    if (reply.content) chunks.push({ model: "deepseek-flash", choices: [{ delta: { content: reply.content } }] });
    (reply.toolCalls ?? []).forEach((tool, i) => {
      callId += 1;
      chunks.push({
        choices: [{ delta: { tool_calls: [{ index: i, id: `c${callId}`, function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] } }],
      });
    });
    chunks.push({
      choices: [{ delta: {}, finish_reason: reply.toolCalls?.length ? "tool_calls" : "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
    });
    const text = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
    return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  return { fetch, requests };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("zheye recipes", () => {
  it("读取仓库里的「讲解概念」配方，渲染时展开引入、替换变量、去掉注释", () => {
    const recipe = loadRecipe(RECIPES, "concept");
    expect(recipe.stages.map((stage) => stage.name)).toEqual([
      "搜集资料",
      "拟定大纲",
      "分析前置",
      "编写文章",
      "检查文章",
      "修改前置、添加前置链接",
    ]);
    expect(recipe.files.map((file) => file.path)).toEqual(
      expect.arrayContaining(["concept/flow.json", "common/system.md", "common/quality.md", "concept/method.md"]),
    );
    expect(recipe.hash).toMatch(/^[0-9a-f]{8}$/);

    const vars = { 讲解对象: "通货膨胀", 类型: "概念", 今天: "2026-10-28", 流程: "a → b", 这一步: "检查文章", 草稿: "「文章」", 前置回答: "无" };
    const text = renderPrompt(recipe.files, "concept/5-check.md", vars);
    expect(text).toContain("## 质量标准");
    expect(text).toContain("## 讲解概念的方法");
    expect(text).not.toContain("<!--");
    expect(text).not.toContain("{{");
    expect(renderPrompt(recipe.files, "common/system.md", vars)).toContain("讲解对象：通货膨胀（概念）");
  });

  it("配方出错时给出原因：未知变量、跳出目录、循环引入", () => {
    const dir = mkdtempSync(join(tmpdir(), "zheye-recipe-"));
    mkdirSync(join(dir, "concept"));
    const flow = (prompt: string) =>
      JSON.stringify({ name: "t", model: "m", reasoningEffort: "max", docs: ["文章"], article: "文章", system: [], stages: [{ id: "a", name: "A", prompt, maxRounds: 2 }] });
    writeFileSync(join(dir, "concept/flow.json"), flow("concept/a.md"));
    writeFileSync(join(dir, "concept/a.md"), "{{引入 concept/b.md}}");
    writeFileSync(join(dir, "concept/b.md"), "{{引入 concept/a.md}} {{不存在}}");
    const recipe = loadRecipe(dir, "concept");
    expect(() => renderPrompt(recipe.files, "concept/a.md", {})).toThrow(/循环引入/);
    writeFileSync(join(dir, "concept/a.md"), "你好 {{不存在}}");
    expect(() => renderPrompt(loadRecipe(dir, "concept").files, "concept/a.md", {})).toThrow(/未知的变量/);
    writeFileSync(join(dir, "concept/flow.json"), flow("../secret.md"));
    expect(() => loadRecipe(dir, "concept")).toThrow(/跳出/);
  });

  it("getRecipe：没有配方的类型返回 null，出错的配方返回原因", async () => {
    const kernel = setup();
    const concept = await call<{ recipe: { name: string } | null; available: string[] }>(kernel, "zheye.getRecipe", { type: "concept" });
    expect(concept.recipe?.name).toBe("讲解概念");
    expect(concept.available).toEqual(["concept"]);
    const entity = await call<{ recipe: unknown; error: string | null }>(kernel, "zheye.getRecipe", { type: "entity" });
    expect(entity).toMatchObject({ recipe: null, error: null });
  });
});

describe("zheye drafts", () => {
  it("查找替换：原文必须恰好出现一次；整篇重写；每次修改都通知", async () => {
    const changes: string[] = [];
    const drafts = createDrafts(["文章"], async (change) => {
      changes.push(`${change.op}:${change.content}`);
    });
    const [read, edit, write] = drafts.tools;
    const ctx = { call: async () => null, emit: () => {}, signal: new AbortController().signal };
    expect(read!.repeatable).toBe(true);
    await write!.execute({ name: "文章", content: "甲乙甲" }, ctx);
    await expect(edit!.execute({ name: "文章", old: "甲", new: "丙" }, ctx)).rejects.toThrow(/出现了 2 次/);
    await expect(edit!.execute({ name: "文章", old: "丁", new: "丙" }, ctx)).rejects.toThrow(/没有找到/);
    await edit!.execute({ name: "文章", old: "乙甲", new: "乙$&戊" }, ctx);
    expect(drafts.get("文章")).toBe("甲乙$&戊");
    await expect(read!.execute({ name: "大纲" }, ctx)).rejects.toThrow(/没有这份草稿/);
    expect(changes).toEqual(["write:甲乙甲", "edit:甲乙$&戊"]);
  });
});

describe("zheye trial", () => {
  it("按配方逐步跑完：每步一次工具循环，轨迹与草稿修改都存下，花费累加", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zheye-recipe-"));
    mkdirSync(join(dir, "concept"));
    mkdirSync(join(dir, "common"));
    writeFileSync(
      join(dir, "concept/flow.json"),
      JSON.stringify({
        name: "讲解概念",
        model: "deepseek-flash",
        reasoningEffort: "max",
        docs: ["大纲", "文章"],
        article: "文章",
        system: ["common/system.md"],
        stages: [
          { id: "outline", name: "拟定大纲", prompt: "concept/outline.md", maxRounds: 4 },
          { id: "write", name: "编写文章", prompt: "concept/write.md", maxRounds: 4 },
        ],
      }),
    );
    writeFileSync(join(dir, "common/system.md"), "讲解对象：{{讲解对象}}。现在是「{{这一步}}」。<!-- 不发给模型 -->");
    writeFileSync(join(dir, "concept/outline.md"), "写大纲。");
    writeFileSync(join(dir, "concept/write.md"), "写文章。前置：{{前置回答}}");

    const fake = fakeDeepSeek([
      { toolCalls: [{ name: "write_doc", args: { name: "大纲", content: "1. 例子\n2. 直觉" } }] },
      { content: "大纲写好了。" },
      { toolCalls: [{ name: "read_doc", args: { name: "大纲" } }] },
      { toolCalls: [{ name: "write_doc", args: { name: "文章", content: "通胀的例子。" } }] },
      { toolCalls: [{ name: "edit_doc", args: { name: "文章", old: "例子", new: "具体例子" } }] },
      { content: "文章写好了。" },
    ]);
    vi.stubGlobal("fetch", fake.fetch);
    const kernel = setup(dir);
    await call(kernel, "platform.settings.set", { key: "ai.deepseek.apiKey", value: "test-key" });

    const events: Array<{ type: string }> = [];
    const result = await call<{ runId: string; status: string }>(
      kernel,
      "zheye.trialStart",
      { subject: "通货膨胀", type: "concept" },
      { caller: "zheye", emit: (event) => events.push(event as { type: string }) },
    );
    expect(result.status).toBe("done");
    expect(events[0]).toEqual({ type: "trial_created", runId: result.runId });

    // 每一步是单独的对话：系统提示词 = 共用 + 这一步；用户消息带上当前草稿
    expect(fake.requests).toHaveLength(6);
    expect(fake.requests[0].messages[0].content).toBe("讲解对象：通货膨胀。现在是「拟定大纲」。\n\n写大纲。");
    expect(fake.requests[0].reasoning_effort).toBe("max");
    expect(fake.requests[2].messages[0].content).toContain("现在是「编写文章」");
    expect(fake.requests[2].messages[1].content).toContain("【大纲】\n1. 例子\n2. 直觉");
    expect(fake.requests[2].messages[0].content).toContain("所有前置都按「正文带过」");

    const detail = await call<any>(kernel, "zheye.trialGet", { runId: result.runId });
    expect(detail.status).toBe("done");
    expect(detail.active).toBe(false);
    expect(detail.events.map((event: any) => `${event.stage}:${event.kind}`)).toEqual([
      "outline:stage_start",
      "outline:doc",
      "outline:round",
      "outline:round",
      "outline:stage_end",
      "write:stage_start",
      "write:round",
      "write:doc",
      "write:round",
      "write:doc",
      "write:round",
      "write:round",
      "write:stage_end",
    ]);
    const lastDoc = detail.events.filter((event: any) => event.kind === "doc").at(-1);
    expect(lastDoc.data).toMatchObject({ doc: "文章", op: "edit", content: "通胀的具体例子。", old: "例子", new: "具体例子" });
    expect(detail.costYuan).toBeGreaterThan(0);
    expect(detail.usage.promptTokens).toBe(6000);
    expect(detail.recipe.files.map((file: any) => file.path)).toContain("concept/write.md");

    const after = await call<any>(kernel, "zheye.trialGet", { runId: result.runId, afterSeq: 11 });
    expect(after.events.map((event: any) => event.seq)).toEqual([12, 13]);

    const list = await call<any[]>(kernel, "zheye.trialList", {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ subject: "通货膨胀", status: "done", flow: "讲解概念" });
  });

  it("停止：已经存下的轨迹保留，状态为 stopped", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zheye-recipe-"));
    mkdirSync(join(dir, "concept"));
    writeFileSync(
      join(dir, "concept/flow.json"),
      JSON.stringify({
        name: "讲解概念",
        model: "deepseek-flash",
        reasoningEffort: "max",
        docs: ["文章"],
        article: "文章",
        system: [],
        stages: [
          { id: "a", name: "A", prompt: "concept/a.md", maxRounds: 4 },
          { id: "b", name: "B", prompt: "concept/a.md", maxRounds: 4 },
        ],
      }),
    );
    writeFileSync(join(dir, "concept/a.md"), "写。");
    const controller = new AbortController();
    const fake = fakeDeepSeek([{ toolCalls: [{ name: "write_doc", args: { name: "文章", content: "草稿" } }] }, { content: "好了" }]);
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      const response = await fake.fetch(url, init);
      if (fake.requests.length === 2) controller.abort(); // 第一步结束时停止
      return response;
    });
    const kernel = setup(dir);
    await call(kernel, "platform.settings.set", { key: "ai.deepseek.apiKey", value: "test-key" });
    const result = await call<{ runId: string; status: string }>(
      kernel,
      "zheye.trialStart",
      { subject: "熵", type: "concept" },
      { caller: "zheye", signal: controller.signal },
    );
    expect(result.status).toBe("stopped");
    const detail = await call<any>(kernel, "zheye.trialGet", { runId: result.runId });
    expect(detail.status).toBe("stopped");
    expect(detail.events.some((event: any) => event.kind === "doc")).toBe(true);
    expect(detail.events.some((event: any) => event.stage === "b")).toBe(false);
  });

  it("没有配方的类型不能开始", async () => {
    const kernel = setup();
    const res = await kernel.handle({ call: "zheye.trialStart", payload: { subject: "x", type: "entity" } }, { caller: "zheye" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PRECONDITION");
  });
});
