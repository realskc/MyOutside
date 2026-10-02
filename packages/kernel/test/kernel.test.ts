import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createKernel, defineRead, defineTx, type AppModule, type DbAdapter, type SqlValue } from "../src/index.js";

/** 测试用的最小 SQLite 适配器（node:sqlite） */
function createMemoryAdapter(): DbAdapter {
  const db = new DatabaseSync(":memory:");
  const normalize = (params: SqlValue[]) =>
    params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p === undefined ? null : p));
  return {
    execute(sql, params = []) {
      const r = db.prepare(sql).run(...normalize(params));
      return { changes: Number(r.changes), lastInsertRowid: (r.lastInsertRowid ?? 0) as number | bigint };
    },
    select(sql, params = []) {
      return db.prepare(sql).all(...normalize(params)) as never[];
    },
    transaction(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        try {
          db.exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
}

const notesApp: AppModule = {
  id: "notes",
  name: "Notes",
  owns: ["note"],
  migrations: [
    {
      id: "0001_init",
      up: (ctx) => {
        ctx.createTable("note", "id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL");
      },
    },
  ],
  api: {
    createNote: defineTx(z.object({ title: z.string().min(1) }), (ctx, input) => {
      const id = randomUUID();
      ctx.db.insert("note", { id, title: input.title, created_at: Date.now() });
      return { id };
    }),
    listNotes: defineRead(z.object({}), (ctx) => ctx.db.all("note", {}, { orderBy: "created_at" })),
    fail: defineTx(z.object({}), () => {
      throw new Error("boom");
    }),
  },
};

const tasksApp: AppModule = {
  id: "tasks",
  name: "Tasks",
  owns: ["task"],
  migrations: [
    {
      id: "0001_init",
      up: (ctx) => {
        ctx.createTable("task", "id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL");
      },
    },
  ],
  api: {
    createNoteWithTask: defineTx(z.object({ title: z.string().min(1) }), (ctx, input) => {
      const note = ctx.call("notes.createNote", { title: input.title }) as { id: string };
      const id = randomUUID();
      ctx.db.insert("task", { id, title: input.title, created_at: Date.now() });
      return { noteId: note.id, taskId: id };
    }),
    createTaskThenFail: defineTx(z.object({ title: z.string().min(1) }), (ctx, input) => {
      const id = randomUUID();
      ctx.db.insert("task", { id, title: input.title, created_at: Date.now() });
      ctx.call("notes.fail", {});
      return { taskId: id };
    }),
    callReadFromTx: defineTx(z.object({}), (ctx) => ctx.call("notes.listNotes", {})),
  },
};

const loopApp: AppModule = {
  id: "loop",
  name: "Loop",
  api: {
    ping: defineTx(z.object({ n: z.number().int() }), (ctx, input) => ctx.call("loop.pong", { n: input.n + 1 })),
    pong: defineTx(z.object({ n: z.number().int() }), (ctx, input) => ctx.call("loop.ping", { n: input.n + 1 })),
  },
};

function setup() {
  const storage = createMemoryAdapter();
  const kernel = createKernel({ storage });
  kernel.registerApp(notesApp);
  kernel.registerApp(tasksApp);
  kernel.registerApp(loopApp);
  kernel.start();
  return { storage, kernel };
}

describe("kernel", () => {
  it("迁移建表；事务写入 + 读函数读取；DataVersion 递增", async () => {
    const { storage, kernel } = setup();
    expect(kernel.dataVersion).toBe(0);

    const created = await kernel.handle({ call: "notes.createNote", payload: { title: "hello" } });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(kernel.dataVersion).toBe(1);

    const listed = await kernel.handle({ call: "notes.listNotes", payload: {} });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.result).toHaveLength(1);
    // 读不改变版本号
    expect(kernel.dataVersion).toBe(1);

    // 物理表名带应用前缀
    const rows = storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM notes__note");
    expect(rows[0]?.c).toBe(1);
  });

  it("跨应用事务：tx.call 同一个事务，两边都写入", async () => {
    const { storage, kernel } = setup();
    const r = await kernel.handle({ call: "tasks.createNoteWithTask", payload: { title: "shared" } });
    expect(r.ok).toBe(true);
    expect(storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM notes__note")[0]?.c).toBe(1);
    expect(storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM tasks__task")[0]?.c).toBe(1);
  });

  it("失败回滚：事务中任一失败 → 全部不落库", async () => {
    const { storage, kernel } = setup();
    const r = await kernel.handle({ call: "tasks.createTaskThenFail", payload: { title: "x" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("INTERNAL");
    expect(storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM tasks__task")[0]?.c).toBe(0);
    expect(storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM notes__note")[0]?.c).toBe(0);
  });

  it("参数校验失败 → VALIDATION", async () => {
    const { kernel } = setup();
    const r = await kernel.handle({ call: "notes.createNote", payload: { title: "" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("VALIDATION");
  });

  it("未知函数 → UNKNOWN_FUNCTION", async () => {
    const { kernel } = setup();
    const r = await kernel.handle({ call: "nope.nothing", payload: {} });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("UNKNOWN_FUNCTION");
  });

  it("事务上下文调用读函数 → TX_CALL_INVALID", async () => {
    const { kernel } = setup();
    const r = await kernel.handle({ call: "tasks.callReadFromTx", payload: {} });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("TX_CALL_INVALID");
  });

  it("调用深度保护", async () => {
    const { kernel } = setup();
    const r = await kernel.handle({ call: "loop.ping", payload: { n: 0 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("CALL_DEPTH_EXCEEDED");
  });

  it("迁移幂等：同一存储再次启动不会重复执行", () => {
    const storage = createMemoryAdapter();
    const first = createKernel({ storage });
    first.registerApp(notesApp);
    first.start();
    const second = createKernel({ storage });
    second.registerApp(notesApp);
    second.start();
    const rows = storage.select<{ c: number }>("SELECT COUNT(*) AS c FROM platform_migration");
    expect(rows[0]?.c).toBe(1);
  });

  it("平台内置 API：platform.dataVersion", async () => {
    const { kernel } = setup();
    await kernel.handle({ call: "notes.createNote", payload: { title: "v" } });
    const r = await kernel.handle({ call: "platform.dataVersion", payload: undefined });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toBe(1);
  });

  it("平台设置：set/get，且同一存储上的新内核可见（持久化）", async () => {
    const storage = createMemoryAdapter();
    const first = createKernel({ storage });
    first.registerApp(notesApp);
    first.start();

    const before = await first.handle({ call: "platform.settings.get", payload: { key: "ui.language" } });
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect((before.result as { value: unknown }).value).toBe(null);

    const set = await first.handle({
      call: "platform.settings.set",
      payload: { key: "ui.language", value: "en" },
    });
    expect(set.ok).toBe(true);

    const second = createKernel({ storage });
    second.registerApp(notesApp);
    second.start();
    const after = await second.handle({ call: "platform.settings.get", payload: { key: "ui.language" } });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect((after.result as { value: unknown }).value).toBe("en");
  });
});
