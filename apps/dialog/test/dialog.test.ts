import { createKernel, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dialogApp } from "../backend/src/index.js";
import dialogManifest from "../manifest.json";
import { estimateTokens, trimHistory } from "../backend/src/history.js";

function setup(): Kernel {
  const storage = createNodeSqliteAdapter({ path: ":memory:" });
  const kernel = createKernel({ storage });
  kernel.registerApp(dialogApp, dialogManifest);
  kernel.start();
  return kernel;
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

  it("generateReply：无 key → PRECONDITION；无回复时不允许生成", async () => {
    const kernel = setup();
    const conversationId = await createConversation(kernel);
    const assistant = await raw(kernel, "dialog.generateReply", { conversationId });
    expect(assistant.ok).toBe(false);
    if (!assistant.ok) expect(assistant.error.code).toBe("PRECONDITION");

    await append(kernel, conversationId, "user", "hi");
    const noKey = await raw(kernel, "dialog.generateReply", { conversationId });
    expect(noKey.ok).toBe(false);
    if (!noKey.ok) expect(noKey.error.code).toBe("PRECONDITION");
  });

  it("generateReply：透传思考强度与模型；返回并落库 reasoning / usage", async () => {
    const kernel = setup();
    await call(kernel, "platform.settings.set", { key: "ai.deepseek.apiKey", value: "test-key" });
    const conversationId = await createConversation(kernel, { reasoningEffort: "low" });
    await append(kernel, conversationId, "user", "hi");

    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          model: "deepseek-flash",
          choices: [
            {
              message: { content: "你好！", reasoning_content: "思考中…", tool_calls: [] },
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 8,
            total_tokens: 20,
            completion_tokens_details: { reasoning_tokens: 5 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const reply = await call<{
      content: string;
      reasoning: string | null;
      model: string;
      usage: { totalTokens: number; reasoningTokens?: number } | null;
    }>(kernel, "dialog.generateReply", { conversationId });
    expect(reply.content).toBe("你好！");
    expect(reply.reasoning).toBe("思考中…");
    expect(reply.model).toBe("deepseek-flash");
    expect(reply.usage?.reasoningTokens).toBe(5);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as Record<string, unknown>;
    expect(requestBody.model).toBe("deepseek-flash");
    expect(requestBody.reasoning_effort).toBe("low");
    expect(Array.isArray(requestBody.messages)).toBe(true);
    const sentMessages = requestBody.messages as Array<{ role: string; content: string }>;
    expect(sentMessages[0]).toMatchObject({ role: "system" });
    expect(sentMessages.at(-1)).toMatchObject({ role: "user", content: "hi" });

    await append(kernel, conversationId, "assistant", reply.content, {
      reasoning: reply.reasoning ?? undefined,
      model: reply.model,
      usage: reply.usage ?? undefined,
    });
    const path = await call<PathResult>(kernel, "dialog.getPath", { conversationId });
    const last = path.messages.at(-1)!;
    expect(last.reasoning).toBe("思考中…");
    expect(last.usage?.totalTokens).toBe(20);

    // 历史请求不包含 reasoning；第二次生成会带上上下文
    fetchMock.mockClear();
    await append(kernel, conversationId, "user", "再说一次");
    await call(kernel, "dialog.generateReply", { conversationId });
    const secondBody = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      messages: Array<{ role: string; content: string; reasoning?: unknown }>;
    };
    expect(secondBody.messages.some((m) => "reasoning" in m)).toBe(false);
    expect(secondBody.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
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
    // 每条 2 token + 4 结构开销 = 6
    expect(trimHistory(messages, 30).map((m) => m.content)).toEqual(["u1", "a1", "u2", "a2", "u3"]);
    expect(trimHistory(messages, 18).map((m) => m.content)).toEqual(["u2", "a2", "u3"]);
    // 放不下时也至少保留最近一条用户消息，且首条必须是 user
    expect(trimHistory(messages, 6).map((m) => m.content)).toEqual(["u3"]);
    expect(trimHistory(messages, 1).map((m) => m.content)).toEqual(["u3"]);
  });
});
