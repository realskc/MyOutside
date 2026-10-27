import { createKernel, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { vocabApp } from "../backend/src/index.js";
import vocabManifest from "../manifest.json";

function setup(): Kernel {
  const storage = createNodeSqliteAdapter({ path: ":memory:" });
  const kernel = createKernel({ storage });
  kernel.registerApp(vocabApp, vocabManifest);
  kernel.start();
  return kernel;
}

async function call<T>(kernel: Kernel, name: string, payload?: unknown): Promise<T> {
  const res = await kernel.handle({ call: name, payload });
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.result as T;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vocab backend", () => {
  it("addCard + getDue（term 归一化、display 保留原样）", async () => {
    const kernel = setup();
    const { cardId } = await call<{ cardId: string }>(kernel, "vocab.addCard", {
      term: "Serendipity",
      sense: "意外发现美好事物的能力",
      meaning: "n. 机缘巧合",
    });
    expect(cardId).toBeTruthy();

    const due = await call<Array<Record<string, unknown>>>(kernel, "vocab.getDue", {});
    expect(due).toHaveLength(1);
    expect(due[0]?.term).toBe("serendipity");
    expect(due[0]?.display).toBe("Serendipity");
  });

  it("同一拼写可有多张卡片；listCards 按 term 精确查询", async () => {
    const kernel = setup();
    await call(kernel, "vocab.addCard", { term: "date", sense: "椰枣" });
    await call(kernel, "vocab.addCard", { term: "Date", sense: "日期 / 约会（时间义）" });
    const list = await call<unknown[]>(kernel, "vocab.listCards", { term: "  date " });
    expect(list).toHaveLength(2);
  });

  it("addCard 支持携带调度状态（用于导入 / 恢复）", async () => {
    const kernel = setup();
    const future = Date.now() + 30 * 86400 * 1000;
    const { cardId } = await call<{ cardId: string }>(kernel, "vocab.addCard", {
      term: "restored",
      sense: "恢复的卡",
      scheduling: {
        due: future,
        stability: 12.5,
        difficulty: 6.2,
        elapsed_days: 10,
        scheduled_days: 12,
        learning_steps: 0,
        reps: 5,
        lapses: 1,
        state: 2,
        last_review: Date.now() - 10 * 86400 * 1000,
      },
    });
    expect(cardId).toBeTruthy();

    // due 在未来 → 不出现在待复习
    expect(await call<unknown[]>(kernel, "vocab.getDue", {})).toHaveLength(0);

    const list = await call<Array<Record<string, unknown>>>(kernel, "vocab.listCards", { term: "restored" });
    expect(list[0]?.stability).toBe(12.5);
    expect(list[0]?.difficulty).toBe(6.2);
    expect(list[0]?.reps).toBe(5);
    expect(list[0]?.last_review).not.toBeNull();
  });

  it("词表分级：命中导入词表带 level（归一化匹配；A 优先合并），未命中为 null", async () => {
    const kernel = setup();
    await call(kernel, "vocab.addCard", { term: "Island", sense: "岛" });
    await call(kernel, "vocab.addCard", { term: "islet", sense: "小岛" });
    await call(kernel, "vocab.addCard", { term: "zzzznotaword", sense: "生造词" });

    const due = await call<Array<{ term: string; level: string | null }>>(kernel, "vocab.getDue", {});
    const byTerm = Object.fromEntries(due.map((card) => [card.term, card.level]));
    expect(byTerm.island).toBe("A");
    expect(byTerm.islet).toBe("D");
    expect(byTerm.zzzznotaword).toBeNull();

    const list = await call<Array<{ level: string | null }>>(kernel, "vocab.listCards", { term: "island" });
    expect(list[0]?.level).toBe("A");

    const empty = await call<Array<{ level: string | null }>>(kernel, "vocab.listCards", { term: "zzzznotaword" });
    expect(empty[0]?.level).toBeNull();
  });

  it("resolveCard：新拼写直接返回 new（不触发 AI）", async () => {
    const kernel = setup();
    const r = await call<{ action: string }>(kernel, "vocab.resolveCard", { term: "brandnew", sense: "新词" });
    expect(r.action).toBe("new");
  });

  it("resolveCard：已存在拼写且未配置 key → PRECONDITION（前端回退机械流程）", async () => {
    const kernel = setup();
    await call(kernel, "vocab.addCard", { term: "run", sense: "跑" });
    const res = await kernel.handle({ call: "vocab.resolveCard", payload: { term: "run", sense: "奔跑" } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PRECONDITION");
  });

  it("submitReview 推进调度：复习后不再到期", async () => {
    const kernel = setup();
    const { cardId } = await call<{ cardId: string }>(kernel, "vocab.addCard", { term: "run", sense: "跑" });
    expect(await call<unknown[]>(kernel, "vocab.getDue", {})).toHaveLength(1);

    const review = await call<{ due: number; scheduledDays: number }>(kernel, "vocab.submitReview", {
      cardId,
      rating: "good",
    });
    expect(review.due).toBeGreaterThan(Date.now());
    expect(await call<unknown[]>(kernel, "vocab.getDue", {})).toHaveLength(0);

    const stats = await call<{ cards: number; learning: number; dueNow: number }>(kernel, "vocab.getStats", {});
    expect(stats.cards).toBe(1);
    expect(stats.learning).toBe(1);
    expect(stats.dueNow).toBe(0);
  });

  it("掌握状态：全手动", async () => {
    const kernel = setup();
    const { cardId } = await call<{ cardId: string }>(kernel, "vocab.addCard", { term: "run", sense: "跑" });
    await call(kernel, "vocab.setMastered", { cardId, mastered: true });
    const stats = await call<{ mastered: number }>(kernel, "vocab.getStats", {});
    expect(stats.mastered).toBe(1);
    expect(await call<unknown[]>(kernel, "vocab.getDue", {})).toHaveLength(0);
  });

  it("updateCard 更新释义 / 音标", async () => {
    const kernel = setup();
    const { cardId } = await call<{ cardId: string }>(kernel, "vocab.addCard", { term: "run", sense: "跑" });
    await call(kernel, "vocab.updateCard", { cardId, patch: { meaning: "新的释义", phonetic: "/rʌn/" } });
    const list = await call<Array<Record<string, unknown>>>(kernel, "vocab.listCards", { term: "run" });
    expect(list[0]?.meaning).toBe("新的释义");
    expect(list[0]?.phonetic).toBe("/rʌn/");
  });

  it("previewReview：返回四个评分对应的下次复习时间", async () => {
    const kernel = setup();
    const { cardId } = await call<{ cardId: string }>(kernel, "vocab.addCard", { term: "preview", sense: "预览" });
    const preview = await call<{
      again: { due: number; scheduledDays: number };
      good: { due: number; scheduledDays: number };
      easy: { due: number; scheduledDays: number };
    }>(kernel, "vocab.previewReview", { cardId });
    expect(preview.again.due).toBeGreaterThan(Date.now());
    expect(preview.good.due).toBeGreaterThanOrEqual(preview.again.due);
    expect(preview.easy.due).toBeGreaterThanOrEqual(preview.good.due);
  });

  it("不存在的卡片 → NOT_FOUND", async () => {
    const kernel = setup();
    const res = await kernel.handle({ call: "vocab.submitReview", payload: { cardId: "nope", rating: "good" } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });

  it("listCards 支持按拼写模糊搜索", async () => {
    const kernel = setup();
    await call(kernel, "vocab.addCard", { term: "apple", sense: "苹果" });
    await call(kernel, "vocab.addCard", { term: "application", sense: "应用" });
    const found = await call<unknown[]>(kernel, "vocab.listCards", { query: "appl" });
    expect(found).toHaveLength(2);
  });

  it("DataVersion 随写入递增、随读取不变", async () => {
    const kernel = setup();
    expect(kernel.dataVersion).toBe(0);
    await call(kernel, "vocab.addCard", { term: "v", sense: "版本" });
    expect(kernel.dataVersion).toBe(1);
    await call(kernel, "vocab.listCards", {});
    expect(kernel.dataVersion).toBe(1);
  });
  it("resolveCard：查重用低强度思考；返回判断时看到的卡片 id（VOCAB-0010）", async () => {
    const kernel = setup();
    await call(kernel, "platform.settings.set", { key: "ai.deepseek.apiKey", value: "test-key" });
    const { cardId } = await call<{ cardId: string }>(kernel, "vocab.addCard", { term: "run", sense: "跑" });
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      const message = { content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "submit_decision", arguments: '{"matchIndex":1}' } }] };
      return new Response(JSON.stringify({ choices: [{ message, finish_reason: "tool_calls" }] }), { status: 200 });
    });
    const r = await call<{ action: string; cardId: string; knownCardIds: string[] }>(kernel, "vocab.resolveCard", { term: "Run", sense: "奔跑" });
    expect(body.reasoning_effort).toBe("low");
    expect(r).toEqual({ action: "match", cardId, knownCardIds: [cardId] });
  });

  it("addCard 提交时校验：判断之后这个拼写又多出卡片 → CONFLICT；看到的卡片没变则正常添加（VOCAB-0010）", async () => {
    const kernel = setup();
    const resolved = await call<{ knownCardIds: string[] }>(kernel, "vocab.resolveCard", { term: "set", sense: "放置" });
    expect(resolved.knownCardIds).toEqual([]);
    // 判断之后、提交之前，别处先添加了同一个词
    await call(kernel, "vocab.addCard", { term: "set", sense: "一套" });
    const stale = await kernel.handle({
      call: "vocab.addCard",
      payload: { term: "set", sense: "放置", knownCardIds: resolved.knownCardIds },
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("CONFLICT");

    const fresh = await call<Array<{ id: string }>>(kernel, "vocab.listCards", { term: "set" });
    await call(kernel, "vocab.addCard", { term: "set", sense: "放置", knownCardIds: fresh.map((card) => card.id) });
    expect(await call<unknown[]>(kernel, "vocab.listCards", { term: "set" })).toHaveLength(2);
  });
});
