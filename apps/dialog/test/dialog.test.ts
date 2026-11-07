import { createKernel, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dialogApp } from "../backend/src/index.js";
import { SEARCH_NOTES } from "../backend/src/generate.js";
import dialogManifest from "../manifest.json";
import { estimateTokens, trimTurns } from "../backend/src/history.js";

function setup(): Kernel {
  const storage = createNodeSqliteAdapter({ path: ":memory:" });
  const kernel = createKernel({ storage });
  kernel.registerApp(dialogApp, dialogManifest);
  kernel.start();
  return kernel;
}

async function setupWithKey(): Promise<Kernel> {
  const kernel = setup();
  await call(kernel, "platform.settings.set", { key: "ai.deepseek.apiKey", value: "test-key" });
  return kernel;
}

interface FakeReply {
  content?: string;
  reasoning?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  promptTokens?: number;
}

/** 按脚本回复的假 DeepSeek：对话接口用 SSE 流式返回；其他接口由 apis 提供；gate 可以让对话请求等待 */
function fakeDeepSeek(replies: FakeReply[], apis: Record<string, (body: any) => unknown> = {}, gate?: Promise<void>) {
  const requests: any[] = [];
  const searches: any[] = [];
  let index = 0;
  const fetch = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const path = new URL(url).pathname;
    if (path === "/chat/completions") {
      requests.push(body);
      if (gate) await gate;
      const reply = replies[index++];
      if (!reply) throw new Error("脚本里没有更多回复");
      const chunks: unknown[] = [];
      if (reply.reasoning) chunks.push({ model: "deepseek-flash", choices: [{ delta: { reasoning_content: reply.reasoning } }] });
      if (reply.content) chunks.push({ model: "deepseek-flash", choices: [{ delta: { content: reply.content } }] });
      (reply.toolCalls ?? []).forEach((call, i) =>
        chunks.push({ choices: [{ delta: { tool_calls: [{ index: i, id: call.id, function: { name: call.name, arguments: call.arguments } }] } }] }),
      );
      const prompt = reply.promptTokens ?? 100;
      chunks.push({
        choices: [{ delta: {}, finish_reason: reply.toolCalls?.length ? "tool_calls" : "stop" }],
        usage: { prompt_tokens: prompt, completion_tokens: 10, total_tokens: prompt + 10 },
      });
      const text = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
      return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    if (path === "/v1/tools/search") searches.push(body);
    const api = apis[path];
    if (!api) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(api(body)), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, requests, searches };
}

async function call<T>(kernel: Kernel, name: string, payload?: unknown): Promise<T> {
  const res = await kernel.handle({ call: name, payload });
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.result as T;
}

async function raw(kernel: Kernel, name: string, payload?: unknown) {
  return kernel.handle({ call: name, payload });
}

async function createConversation(kernel: Kernel, payload: Record<string, unknown> = {}): Promise<string> {
  const result = await call<{ conversationId: string }>(kernel, "dialog.createConversation", payload);
  return result.conversationId;
}

async function append(
  kernel: Kernel,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const result = await call<{ messageId: string }>(kernel, "dialog.appendMessage", {
    conversationId,
    role,
    content,
    ...extra,
  });
  return result.messageId;
}

interface PathResult {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    reasoning: string | null;
    usage: { totalTokens: number; reasoningTokens?: number } | null;
    siblingCount: number;
    siblingIndex: number;
    siblingIds: string[];
  }>;
  hasMore: boolean;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dialog backend", () => {
  it("createConversation + appendMessage：自动标题、路径与翻页", async () => {
    const kernel = setup();
    const conversationId = await createConversation(kernel);
    await append(kernel, conversationId, "user", "帮我写一段介绍 MyOutside 的文字，谢谢！");
    await append(kernel, conversationId, "assistant", "好的。");

    const list = await call<Array<{ id: string; title: string }>>(kernel, "dialog.listConversations", {});
    expect(list).toHaveLength(1);
    expect(list[0]!.title.startsWith("帮我写一段")).toBe(true);
    expect(list[0]!.title.length).toBeLessThanOrEqual(24);

    const path = await call<PathResult>(kernel, "dialog.getPath", { conversationId, limit: 1 });
    expect(path.hasMore).toBe(true);
    expect(path.messages.map((m) => m.role)).toEqual(["assistant"]);

    const full = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    expect(full.hasMore).toBe(false);
    expect(full.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("问答交替校验", async () => {
    const kernel = setup();
    const conversationId = await createConversation(kernel);

    const assistantFirst = await raw(kernel, "dialog.appendMessage", {
      conversationId,
      role: "assistant",
      content: "早",
    });
    expect(assistantFirst.ok).toBe(false);
    if (!assistantFirst.ok) expect(assistantFirst.error.code).toBe("PRECONDITION");

    await append(kernel, conversationId, "user", "你好");
    const userAgain = await raw(kernel, "dialog.appendMessage", {
      conversationId,
      role: "user",
      content: "在吗",
    });
    expect(userAgain.ok).toBe(false);

    await append(kernel, conversationId, "assistant", "在的");
    const assistantAgain = await raw(kernel, "dialog.appendMessage", {
      conversationId,
      role: "assistant",
      content: "还有事吗",
    });
    expect(assistantAgain.ok).toBe(false);
  });

  it("editUserMessage 产生分叉；switchBranch 切换；分支记忆各自保留", async () => {
    const kernel = setup();
    const conversationId = await createConversation(kernel);
    const u1 = await append(kernel, conversationId, "user", "第一条");
    const a1 = await append(kernel, conversationId, "assistant", "回复一");

    const u1b = await call<{ messageId: string }>(kernel, "dialog.editUserMessage", {
      messageId: u1,
      content: "第一条（改）",
    });

    let path = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m) => m.id)).toEqual([u1b.messageId]);
    expect(path.messages[0]!.siblingCount).toBe(2);
    expect(path.messages[0]!.siblingIndex).toBe(2);
    expect(path.messages[0]!.siblingIds).toEqual([u1, u1b.messageId]);

    const a2 = await append(kernel, conversationId, "assistant", "回复二");

    // 切回旧分叉
    await call(kernel, "dialog.switchBranch", { conversationId, parentId: null, childId: u1 });
    path = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m) => m.id)).toEqual([u1, a1]);

    // 再切回新分叉：应记得它自己的末端
    await call(kernel, "dialog.switchBranch", { conversationId, parentId: null, childId: u1b.messageId });
    path = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m) => m.id)).toEqual([u1b.messageId, a2]);
  });

  it("中间用户消息编辑：分叉挂在原父节点下", async () => {
    const kernel = setup();
    const conversationId = await createConversation(kernel);
    const u1 = await append(kernel, conversationId, "user", "u1");
    const a1 = await append(kernel, conversationId, "assistant", "a1");
    const u2 = await append(kernel, conversationId, "user", "u2");
    const a2 = await append(kernel, conversationId, "assistant", "a2");

    const u2b = await call<{ messageId: string }>(kernel, "dialog.editUserMessage", {
      messageId: u2,
      content: "u2（改）",
    });
    let path = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m) => m.id)).toEqual([u1, a1, u2b.messageId]);
    expect(path.messages[2]!.siblingIds).toEqual([u2, u2b.messageId]);
    expect(path.messages[2]!.siblingIndex).toBe(2);

    // 在 a1 下切换回旧分叉
    await call(kernel, "dialog.switchBranch", { conversationId, parentId: a1, childId: u2 });
    path = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m) => m.id)).toEqual([u1, a1, u2, a2]);

    // 非法切换：目标不是该位置的分叉
    const bad = await raw(kernel, "dialog.switchBranch", { conversationId, parentId: null, childId: u2 });
    expect(bad.ok).toBe(false);

    // 只能编辑用户消息
    const badEdit = await raw(kernel, "dialog.editUserMessage", { messageId: a2, content: "改助手" });
    expect(badEdit.ok).toBe(false);
    if (!badEdit.ok) expect(badEdit.error.code).toBe("PRECONDITION");
  });

  it("会话设置：system prompt / 思考强度 / 重命名 / 删除级联", async () => {
    const kernel = setup();
    const conversationId = await createConversation(kernel, { reasoningEffort: "low" });
    await append(kernel, conversationId, "user", "hi");

    let list = await call<Array<{ reasoningEffort: string; title: string; systemPrompt: string | null }>>(
      kernel,
      "dialog.listConversations",
      {},
    );
    expect(list[0]!.reasoningEffort).toBe("low");

    await call(kernel, "dialog.setReasoningEffort", { conversationId, effort: "max" });
    await call(kernel, "dialog.setSystemPrompt", { conversationId, systemPrompt: "你是猫娘。" });
    await call(kernel, "dialog.renameConversation", { conversationId, title: "测试会话" });
    list = await call(kernel, "dialog.listConversations", {});
    expect(list[0]!.reasoningEffort).toBe("max");
    expect(list[0]!.systemPrompt).toBe("你是猫娘。");
    expect(list[0]!.title).toBe("测试会话");

    await call(kernel, "dialog.setSystemPrompt", { conversationId, systemPrompt: null });
    expect((await call<typeof list>(kernel, "dialog.listConversations", {}))[0]!.systemPrompt).toBeNull();

    await call(kernel, "dialog.deleteConversation", { conversationId });
    expect(await call<unknown[]>(kernel, "dialog.listConversations", {})).toHaveLength(0);
    const gone = await raw(kernel, "dialog.getPath", { conversationId });
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.code).toBe("NOT_FOUND");
  });

  it("getUsage：汇总所有回复（忽略无 usage 的消息，不计其他会话）", async () => {
    const kernel = setup();
    const conversationId = await createConversation(kernel);
    await append(kernel, conversationId, "user", "hi");
    await append(kernel, conversationId, "assistant", "a", {
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, reasoningTokens: 3 },
    });
    await append(kernel, conversationId, "user", "again");
    await append(kernel, conversationId, "assistant", "b", {
      usage: { promptTokens: 20, completionTokens: 7, totalTokens: 27 },
    });

    const other = await createConversation(kernel);
    await append(kernel, other, "user", "x");
    await append(kernel, other, "assistant", "y", {
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });

    const usage = await call<{
      replies: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      reasoningTokens: number;
    }>(kernel, "dialog.getUsage", { conversationId });
    expect(usage).toEqual({
      replies: 2,
      promptTokens: 30,
      completionTokens: 12,
      totalTokens: 42,
      reasoningTokens: 3,
    });
  });

  it("send：无 key → PRECONDITION；用户消息保留；之后可以用 generate 重试", async () => {
    const kernel = setup();
    const conversationId = await createConversation(kernel);
    const res = await raw(kernel, "dialog.send", { conversationId, content: "hi" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PRECONDITION");
    const path = await call<PathResult & { generating: boolean }>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m) => m.role)).toEqual(["user"]);
    expect(path.generating).toBe(false);

    await call(kernel, "platform.settings.set", { key: "ai.deepseek.apiKey", value: "test-key" });
    const model = fakeDeepSeek([{ content: "你好！" }]);
    vi.stubGlobal("fetch", model.fetch);
    const reply = await call<{ messageId: string; parentId: string }>(kernel, "dialog.generate", {
      conversationId,
      parentId: path.messages[0]!.id,
    });
    expect(reply.parentId).toBe(path.messages[0]!.id);
    const after = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    expect(after.messages.map((m) => m.content)).toEqual(["hi", "你好！"]);
  });

  it("send：流式生成、后端保存回复（思考过程 / 用量 / 上下文长度）；系统提示带日期；思考强度透传", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel, { reasoningEffort: "low", webSearch: false });
    const model = fakeDeepSeek([{ content: "你好！", reasoning: "打个招呼", promptTokens: 120 }]);
    vi.stubGlobal("fetch", model.fetch);

    const events: unknown[] = [];
    const res = await kernel.handle(
      { call: "dialog.send", payload: { conversationId, content: "hi" } },
      { emit: (event) => events.push(event) },
    );
    expect(res.ok).toBe(true);
    const body = model.requests[0]!;
    expect(body.stream).toBe(true);
    expect(body.reasoning_effort).toBe("low");
    // 关掉联网搜索：工具定义照常带上，但不许调用；用户消息后面跟一条 system 说明（DIALOG-0019）
    expect(body.tools.map((t: any) => t.function.name)).toEqual(["web_search", "web_fetch"]);
    expect(body.tool_choice).toBe("none");
    expect(body.messages.slice(1)).toEqual([
      { role: "user", content: "hi" },
      { role: "system", content: SEARCH_NOTES.off },
    ]);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toMatch(/当前日期：\d{4}-\d{2}-\d{2}/);
    expect(events).toContainEqual({ type: "ai_delta", content: "你好！" });

    const path = await call<PathResult & { contextTokens: number; generating: boolean }>(kernel, "dialog.getPath", { conversationId });
    const last = path.messages.at(-1)! as PathResult["messages"][number] & { contextTokens: number | null };
    expect(last.content).toBe("你好！");
    expect(last.reasoning).toBe("打个招呼");
    expect(last.usage?.totalTokens).toBe(130);
    expect(last.contextTokens).toBe(120);
    expect(path.contextTokens).toBe(120 + estimateTokens("你好！"));
    expect(path.generating).toBe(false);
  });

  it("联网搜索：模型调用搜索 → 执行 → 回答带引用；保存搜索过程与来源；下一轮历史回传思考过程与工具消息", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel); // 默认打开联网搜索
    const model = fakeDeepSeek(
      [
        {
          content: "我先搜索一下。",
          reasoning: "需要最新信息",
          toolCalls: [{ id: "c1", name: "web_search", arguments: '{"query":"DeepSeek 发布"}' }],
        },
        { content: "DeepSeek 开放了搜索 API [1]。", reasoning: "整理结果" },
        { content: "不客气。", reasoning: "礼貌回应" },
      ],
      {
        "/v1/tools/search": () => ({
          results: [
            { title: "DeepSeek 开放搜索 API", url: "https://example.com/a", snippet: "短", summary: "长摘要", site_name: "Example", date: "2026-10-17T00:00:00Z" },
          ],
        }),
      },
    );
    vi.stubGlobal("fetch", model.fetch);

    await call(kernel, "dialog.send", { conversationId, content: "DeepSeek 最近发布了什么？" });
    expect(model.requests[0]!.tools.map((t: any) => t.function.name)).toEqual(["web_search", "web_fetch"]);
    expect(model.requests[0]!.messages[0].content).toContain("[1]");
    expect(model.searches[0]).toMatchObject({ query: "DeepSeek 发布", ori_question: "DeepSeek 最近发布了什么？" });

    let path = await call<any>(kernel, "dialog.getPath", { conversationId });
    const reply = path.messages.at(-1);
    expect(reply.content).toBe("DeepSeek 开放了搜索 API [1]。");
    expect(reply.steps).toHaveLength(1);
    expect(reply.steps[0].toolCalls[0]).toMatchObject({ name: "web_search", ok: true, summary: "搜索：DeepSeek 发布" });
    expect(reply.sources).toEqual([
      { index: 1, url: "https://example.com/a", title: "DeepSeek 开放搜索 API", siteName: "Example", snippet: "短", date: "2026-10-17T00:00:00Z" },
    ]);

    await call(kernel, "dialog.send", { conversationId, content: "谢谢" });
    const history = model.requests[2]!.messages.slice(1).map((m: any) => ({
      role: m.role,
      reasoning: m.reasoning_content ?? null,
      tools: m.tool_calls?.length ?? 0,
    }));
    expect(history).toEqual([
      { role: "user", reasoning: null, tools: 0 },
      { role: "assistant", reasoning: "需要最新信息", tools: 1 },
      { role: "tool", reasoning: null, tools: 0 },
      { role: "assistant", reasoning: "整理结果", tools: 0 },
      { role: "user", reasoning: null, tools: 0 },
    ]);
    path = await call<any>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m: any) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("中途关闭 / 重新打开联网搜索：工具定义、系统提示词、历史都不变；变化记在用户消息上，之后的请求都带着这条 system 说明", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel);
    const model = fakeDeepSeek(
      [
        { content: "", toolCalls: [{ id: "c1", name: "web_search", arguments: '{"query":"x"}' }] },
        { content: "结果 [1]" },
        { content: "好的" },
        { content: "还是不搜" },
        { content: "可以搜了" },
      ],
      { "/v1/tools/search": () => ({ results: [{ title: "t", url: "https://e.com", summary: "s" }] }) },
    );
    vi.stubGlobal("fetch", model.fetch);
    await call(kernel, "dialog.send", { conversationId, content: "查一下" });
    await call(kernel, "dialog.setWebSearch", { conversationId, enabled: false });
    await call(kernel, "dialog.send", { conversationId, content: "继续" });
    await call(kernel, "dialog.send", { conversationId, content: "再继续" });
    await call(kernel, "dialog.setWebSearch", { conversationId, enabled: true });
    await call(kernel, "dialog.send", { conversationId, content: "现在搜吧" });
    const first = model.requests[0]!;
    const off = model.requests[2]!;
    const stillOff = model.requests[3]!;
    const on = model.requests[4]!;
    expect(off.tools).toEqual(first.tools);
    expect(off.messages[0]).toEqual(first.messages[0]);
    expect(first.tool_choice).toBeUndefined();
    expect(off.tool_choice).toBe("none");
    expect(off.messages.map((m: any) => m.role)).toEqual(["system", "user", "assistant", "tool", "assistant", "user", "system"]);
    expect(off.messages.at(-1).content).toBe(SEARCH_NOTES.off);
    // 下一次请求：前面的内容（含那条 system 说明）原样保留，开关没再变就不再加说明
    expect(stillOff.messages.slice(0, off.messages.length)).toEqual([...off.messages.slice(0, -1), off.messages.at(-1)]);
    expect(stillOff.messages.slice(off.messages.length).map((m: any) => m.role)).toEqual(["assistant", "user"]);
    expect(stillOff.tool_choice).toBe("none");
    // 重新打开：加一条「重新打开」的说明，可以调用
    expect(on.tool_choice).toBeUndefined();
    expect(on.messages.at(-1)).toEqual({ role: "system", content: SEARCH_NOTES.on });
    const path = await call<any>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.filter((m: any) => m.role === "user").map((m: any) => m.searchNotice)).toEqual([null, "off", null, "on"]);
    const list = await call<Array<{ webSearch: boolean }>>(kernel, "dialog.listConversations", {});
    expect(list[0]!.webSearch).toBe(true);
  });

  it("重新生成：为同一条用户消息生成新回复，成为原回复的兄弟并被选中（DIALOG-0012）", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel, { webSearch: false });
    vi.stubGlobal("fetch", fakeDeepSeek([{ content: "第一版" }, { content: "第二版" }]).fetch);
    const first = await call<{ messageId: string; parentId: string }>(kernel, "dialog.send", { conversationId, content: "讲个笑话" });
    const second = await call<{ messageId: string }>(kernel, "dialog.generate", { conversationId, parentId: first.parentId });
    const path = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    const reply = path.messages.at(-1)!;
    expect(reply.id).toBe(second.messageId);
    expect(reply.content).toBe("第二版");
    expect(reply.siblingIds).toEqual([first.messageId, second.messageId]);
    expect(path.messages.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("editAndSend：编辑用户消息产生新分叉，并为新分叉生成回复", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel, { webSearch: false });
    vi.stubGlobal("fetch", fakeDeepSeek([{ content: "回复一" }, { content: "回复二" }]).fetch);
    const first = await call<{ parentId: string }>(kernel, "dialog.send", { conversationId, content: "原问题" });
    await call(kernel, "dialog.editAndSend", { messageId: first.parentId, content: "改过的问题" });
    const path = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m) => m.content)).toEqual(["改过的问题", "回复二"]);
    expect(path.messages[0]!.siblingCount).toBe(2);
  });

  it("回复挂在明确的父节点上：生成期间切换了分支也不会挂错地方", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel, { webSearch: false });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const model = fakeDeepSeek([{ content: "旧分支的回答" }], {}, gate);
    vi.stubGlobal("fetch", model.fetch);

    const u1 = await append(kernel, conversationId, "user", "旧问题");
    const pending = call<{ messageId: string }>(kernel, "dialog.generate", { conversationId, parentId: u1 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const busy = await raw(kernel, "dialog.generate", { conversationId, parentId: u1 });
    expect(busy.ok).toBe(false); // 同一会话同一时刻只生成一条
    const generating = await call<{ generating: boolean }>(kernel, "dialog.getPath", { conversationId });
    expect(generating.generating).toBe(true);

    const u1b = await call<{ messageId: string }>(kernel, "dialog.editUserMessage", { messageId: u1, content: "新问题" });
    release();
    const reply = await pending;

    let path = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m) => m.id)).toEqual([u1b.messageId]); // 当前仍在新分支
    await call(kernel, "dialog.switchBranch", { conversationId, parentId: null, childId: u1 });
    path = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m) => m.id)).toEqual([u1, reply.messageId]);
  });

  it("取消：以 ABORTED 结束，不保存回复，不再显示生成中", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel, { webSearch: false });
    vi.stubGlobal("fetch", (_url: string, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const controller = new AbortController();
    const pending = kernel.handle({ call: "dialog.send", payload: { conversationId, content: "写一篇长文" } }, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    const res = await pending;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ABORTED");
    const path = await call<PathResult & { generating: boolean }>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m) => m.role)).toEqual(["user"]);
    expect(path.generating).toBe(false);
  });

  it("停止：已输出的部分保存为回复（标记已停止）；下一次请求的历史里带上这半截（DIALOG-0017）", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel, { webSearch: false });
    const controller = new AbortController();
    const requests: any[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string; signal: AbortSignal }) => {
      requests.push(JSON.parse(init.body));
      if (requests.length > 1) {
        const text = `data: ${JSON.stringify({ choices: [{ delta: { content: "好的" }, finish_reason: "stop" }], usage: { prompt_tokens: 50, completion_tokens: 2, total_tokens: 52 } })}\n\ndata: [DONE]\n\n`;
        return new Response(text, { status: 200 });
      }
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          const send = (chunk: unknown) => stream.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          send({ model: "deepseek-flash", choices: [{ delta: { reasoning_content: "构思" } }] });
          send({ choices: [{ delta: { content: "从前有座山，" } }] });
          init.signal.addEventListener("abort", () => stream.error(new DOMException("aborted", "AbortError")));
          setTimeout(() => controller.abort(), 10);
        },
      });
      return new Response(body, { status: 200 });
    });

    const res = await kernel.handle({ call: "dialog.send", payload: { conversationId, content: "讲个故事" } }, { signal: controller.signal });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.result as { stopReason: string }).stopReason).toBe("stopped");
    const path = await call<any>(kernel, "dialog.getPath", { conversationId });
    const reply = path.messages.at(-1);
    expect(reply).toMatchObject({ role: "assistant", content: "从前有座山，", reasoning: "构思", stopped: true });
    expect(path.generating).toBe(false);

    await call(kernel, "dialog.send", { conversationId, content: "继续" });
    expect(requests[1].messages.slice(1).map((m: any) => [m.role, m.content])).toEqual([
      ["user", "讲个故事"],
      ["system", SEARCH_NOTES.off],
      ["assistant", "从前有座山，"],
      ["user", "继续"],
    ]);
  });

  it("停止发生在搜索中：保存搜索过程（未完成的搜索记为已取消），没有最终回答", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel);
    const controller = new AbortController();
    const model = fakeDeepSeek(
      [{ content: "我先搜索一下。", toolCalls: [{ id: "c1", name: "web_search", arguments: '{"query":"x"}' }] }],
    );
    vi.stubGlobal("fetch", async (url: string, init: { body: string; signal: AbortSignal }) => {
      if (new URL(url).pathname === "/v1/tools/search") {
        setTimeout(() => controller.abort(), 5);
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }
      return model.fetch(url, init);
    });
    const res = await kernel.handle({ call: "dialog.send", payload: { conversationId, content: "查一下" } }, { signal: controller.signal });
    expect(res.ok).toBe(true);
    const reply = (await call<any>(kernel, "dialog.getPath", { conversationId })).messages.at(-1);
    expect(reply.stopped).toBe(true);
    expect(reply.content).toBe("");
    expect(reply.steps[0].content).toBe("我先搜索一下。");
    expect(reply.steps[0].toolCalls[0]).toMatchObject({ name: "web_search", ok: false, result: "已被用户取消" });
  });

  it("断网中断：重试都失败时，保存已输出的部分并标记已中断（DIALOG-0018）；重试时推送 round_retry", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel, { webSearch: false });
    let attempts = 0;
    vi.stubGlobal("fetch", async () => {
      attempts += 1;
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: `第 ${attempts} 次写到一半` } }] })}\n\n`));
          setTimeout(() => stream.error(new TypeError("terminated")), 5);
        },
      });
      return new Response(body, { status: 200 });
    });
    const events: any[] = [];
    const res = await kernel.handle({ call: "dialog.send", payload: { conversationId, content: "讲个故事" } }, { emit: (e) => events.push(e) });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.result as { stopReason: string }).stopReason).toBe("interrupted");
    expect(attempts).toBe(3);
    expect(events.filter((e) => e.type === "round_retry")).toHaveLength(2);
    const reply = (await call<any>(kernel, "dialog.getPath", { conversationId })).messages.at(-1);
    expect(reply).toMatchObject({ role: "assistant", content: "第 3 次写到一半", stopped: false });
    expect(reply.error).toContain("读取流式响应失败");
  }, 15000);

  it("内部 API：其他子应用不能调用 dialog.send", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel);
    const res = await kernel.handle({ call: "dialog.send", payload: { conversationId, content: "x" } }, { caller: "vocab" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("getRequest：导出真实请求（system prompt、历史、工具、参数），只读不生成", async () => {
    const kernel = await setupWithKey();
    const conversationId = await createConversation(kernel, { reasoningEffort: "low", systemPrompt: "你是猫娘。" });
    const model = fakeDeepSeek([{ content: "回复一", reasoning: "想一想", promptTokens: 42 }]);
    vi.stubGlobal("fetch", model.fetch);
    await call(kernel, "dialog.send", { conversationId, content: "问题一" });
    const u2 = await append(kernel, conversationId, "user", "问题二");

    const req = await call<{ body: any; source: any }>(kernel, "dialog.getRequest", {
      conversationId,
      messageId: u2,
    });
    expect(req.source).toMatchObject({ conversationId, messageId: u2 });
    expect(req.body).toMatchObject({ model: "deepseek-flash", stream: false, reasoning_effort: "low" });
    expect(req.body.messages[0].role).toBe("system");
    expect(req.body.messages[0].content).toContain("你是猫娘。");
    expect(req.body.messages[0].content).toMatch(/当前日期：\d{4}-\d{2}-\d{2}/);
    expect(req.body.messages.slice(1).map((m: any) => [m.role, m.content])).toEqual([
      ["user", "问题一"],
      ["assistant", "回复一"],
      ["user", "问题二"],
    ]);
    expect(req.body.messages[2].reasoning_content).toBe("想一想");
    expect(req.body.tools.map((t: any) => t.function.name)).toEqual(["web_search", "web_fetch"]);
    expect(req.body.tool_choice).toBeUndefined();

    // 只读：不生成新回复，也不写 search_notice
    const path = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    expect(path.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(model.requests).toHaveLength(1);
  });

  it("getRequest：联网搜索关闭时工具照常带上、tool_choice = none；只能导入用户消息", async () => {
    const kernel = setup();
    const conversationId = await createConversation(kernel, { webSearch: false });
    const u1 = await append(kernel, conversationId, "user", "hi");
    const a1 = await append(kernel, conversationId, "assistant", "hello");

    const req = await call<{ body: any }>(kernel, "dialog.getRequest", { conversationId, messageId: u1 });
    expect(req.body.tools.map((t: any) => t.function.name)).toEqual(["web_search", "web_fetch"]);
    expect(req.body.tool_choice).toBe("none");

    const bad = await raw(kernel, "dialog.getRequest", { conversationId, messageId: a1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("PRECONDITION");
  });

  it("labRun：请求体原样发出，成功时保存完整运行记录（可列表、读取、删除）", async () => {
    const kernel = await setupWithKey();
    let sent: any = null;
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          id: "raw-1",
          model: "deepseek-flash",
          choices: [{ message: { content: "原始回答", reasoning_content: "原始思考" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const body = { model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], max_tokens: 7, top_p: 0.8, stream: false };
    const run = await call<any>(kernel, "dialog.labRun", { body });
    expect(sent).toEqual(body);
    expect(run).toMatchObject({ status: "ok", error: null, model: "deepseek-flash" });
    expect(run.request).toEqual(body);
    expect(run.response.id).toBe("raw-1");
    expect(run.response.choices[0].message.reasoning_content).toBe("原始思考");
    expect(run.usage).toMatchObject({ promptTokens: 10, completionTokens: 4, totalTokens: 14 });
    expect(run.costYuan).toBeGreaterThan(0);
    expect(run.durationMs).toBeGreaterThanOrEqual(0);

    const list = await call<any[]>(kernel, "dialog.listLabRuns", {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: run.id, status: "ok", title: "hi" });
    const got = await call<any>(kernel, "dialog.getLabRun", { runId: run.id });
    expect(got.response.id).toBe("raw-1");

    await call(kernel, "dialog.deleteLabRun", { runId: run.id });
    expect(await call<any[]>(kernel, "dialog.listLabRuns", {})).toHaveLength(0);
  });

  it("labRun：上游错误也保存运行记录，响应里带完整错误体", async () => {
    const kernel = await setupWithKey();
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error: { message: "bad request", type: "invalid_request_error" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const body = { model: "deepseek-flash", messages: [{ role: "user", content: "hi" }] };
    const run = await call<any>(kernel, "dialog.labRun", { body });
    expect(run.status).toBe("error");
    expect(run.error).toContain("HTTP 400");
    expect(run.response).toEqual({ error: { message: "bad request", type: "invalid_request_error" } });
    expect(run.request).toEqual(body);

    const list = await call<any[]>(kernel, "dialog.listLabRuns", {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: "error" });
  });

  it("labRun：stream=true 作为错误运行保存（v1 不支持流式）", async () => {
    const kernel = await setupWithKey();
    const run = await call<any>(kernel, "dialog.labRun", {
      body: { model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], stream: true },
    });
    expect(run.status).toBe("error");
    expect(run.error).toContain("不支持流式");
  });

  it("上下文截断：估算与从最近保留（从 user 开始）", () => {
    expect(estimateTokens("你好")).toBe(2);
    expect(estimateTokens("hello")).toBe(2);
    expect(estimateTokens("")).toBe(0);

    const messages = [
      { role: "user" as const, content: "u1" },
      { role: "assistant" as const, content: "a1" },
      { role: "user" as const, content: "u2" },
      { role: "assistant" as const, content: "a2" },
      { role: "user" as const, content: "u3" },
    ];
    const trim = (budget: number) =>
      trimTurns(messages.map((message) => ({ role: message.role, messages: [message] })), budget).map((m) => m.content);
    // 每条 2 token + 4 结构开销 = 6
    expect(trim(30)).toEqual(["u1", "a1", "u2", "a2", "u3"]);
    expect(trim(18)).toEqual(["u2", "a2", "u3"]);
    // 放不下时也至少保留最近一条用户消息，且首条必须是 user
    expect(trim(6)).toEqual(["u3"]);
    expect(trim(1)).toEqual(["u3"]);
  });
});
