import { createKernel, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { describe, expect, it } from "vitest";
import { vocabApp } from "../backend/src/index.js";

function setup(): Kernel {
  const storage = createNodeSqliteAdapter({ path: ":memory:" });
  const kernel = createKernel({ storage });
  kernel.registerApp(vocabApp);
  kernel.start();
  return kernel;
}

async function call<T>(kernel: Kernel, name: string, payload?: unknown): Promise<T> {
  const res = await kernel.handle({ call: name, payload });
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.result as T;
}

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
});
